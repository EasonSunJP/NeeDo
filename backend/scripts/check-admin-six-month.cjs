const fs = require('node:fs');
const assert = require('node:assert/strict');
require('dotenv').config({ path: process.env.ENV_FILE || '.env.dev', quiet: true });
const { prisma, disconnectPrisma } = require('../src/prisma/client.ts');
const plan = JSON.parse(fs.readFileSync(process.env.ADMIN_STAFFING_PLAN, 'utf8'));
const base = process.env.FORMAL_API_URL;
assert(base, 'FORMAL_API_URL is required');
async function request(path, token, body) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? {authorization: 'Bearer ' + token} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) });
  const data = await res.json();
  assert(res.ok && data.code === 0, `${path}: ${res.status} ${data.message}`);
  return data.data;
}
async function main() {
  for (const account of plan.accounts) {
    const user = await prisma.user.findUnique({where:{email:account.email},select:{id:true,identities:{where:{isActive:true,deletedAt:null,type:{in:['customer','technician','merchant_owner']}},select:{id:true,type:true,scopeId:true}}}});
    assert(user);
    const shopId = user.identities.find(i=>i.type==='merchant_owner').scopeId;
    const exclusiveConflicts = await prisma.technicianShopAffiliation.count({where:{technicianProfile:{user:{email:{in:account.staff}}},shopId:{not:shopId},relationshipType:'EXCLUSIVE',activeKey:{not:null},endsAt:null,deletedAt:null,workStatus:{not:'ENDED'}}});
    assert.equal(exclusiveConflicts,0,'Other-shop exclusive affiliations must be resolved before acceptance');
    const audits = await prisma.auditLog.findMany({where:{actorId:user.id,action:{startsWith:plan.namespace+'.day.'},deletedAt:null},select:{metadata:true}});
    assert.equal(audits.length,181);
    const availabilityIds = audits.flatMap(a=>a.metadata.availabilityIds);
    const slotIds = audits.flatMap(a=>a.metadata.slotIds);
    const availability = await prisma.availability.findMany({where:{id:{in:availabilityIds},deletedAt:null,isActive:true},select:{id:true,technicianProfileId:true,startsAt:true,endsAt:true}});
    assert.equal(availability.length,10860/2);
    const periods = new Map();
    for (const a of availability) {
      for (let t=a.startsAt.getTime();t<a.endsAt.getTime();t+=3600000) {
        const people=periods.get(t)||new Set();people.add(a.technicianProfileId);periods.set(t,people);
      }
    }
    assert.equal(periods.size,181*24);
    assert.equal(Math.min(...[...periods.values()].map(p=>p.size)),10);
    const slots = await prisma.scheduleSlot.findMany({where:{shopId,deletedAt:null,startsAt:{gte:new Date(plan.startDate+'T00:00:00+09:00'),lt:new Date(plan.endDate+'T00:00:00+09:00')}},select:{id:true,technicianProfileId:true,startsAt:true,endsAt:true,status:true}});
    const allSlotIds = new Set(slots.map(s=>s.id));
    assert(slotIds.every(id=>allSlotIds.has(id)),'Missing generated slot');
    const slotCoverage = new Map();
    for(const s of slots.filter(s=>s.status!=='BLOCKED'&&s.technicianProfileId)) {
      for(let t=s.startsAt.getTime();t+3600000<=s.endsAt.getTime();t+=3600000){
        const people=slotCoverage.get(t)||new Set();people.add(s.technicianProfileId);slotCoverage.set(t,people);
      }
    }
    const minimumFullHourSlotCoverage=Math.min(...[...periods.keys()].map(t=>(slotCoverage.get(t)||new Set()).size));
    // Existing 45/90-minute services can leave less than a full new 60-minute
    // appointment between bookings. Staffing coverage is verified from the
    // persisted eight-hour Availability intervals above, not spare capacity.
    const password=account.email==='admin@lifedance.com'?process.env.ADMIN_DEFAULT_PASSWORD:process.env.LIFEDANCE_ADMIN2_PASSWORD;
    assert(password,'Configured test password is required');
    let auth=await request('/auth/login',null,{loginIdentifier:account.email,password});
    const contactResults=[];
    for(const identity of user.identities){
      auth=await request('/auth/switch-identity',auth.accessToken,{identityId:identity.id,refreshToken:auth.refreshToken});
      const contacts=[];
      for(let page=1;;page++){
        const data=await request(`/im/contacts?page=${page}&pageSize=100`,auth.accessToken);
        contacts.push(...data.list);if(contacts.length>=data.total)break;
        assert(page<20,'Pagination did not finish');
      }
      assert(contacts.length>=75);
      const dbContacts=await prisma.contact.findMany({where:{ownerIdentityId:identity.id,deletedAt:null,blockedAt:null},select:{contactIdentity:{select:{type:true,isActive:true,deletedAt:true}},contactUser:{select:{isTestAccount:true,isActive:true,deletedAt:true}}}});
      const counts=Object.fromEntries(['customer','technician','merchant_owner'].map(type=>[type,dbContacts.filter(c=>c.contactIdentity.type===type&&c.contactIdentity.isActive&&!c.contactIdentity.deletedAt&&c.contactUser.isTestAccount&&c.contactUser.isActive&&!c.contactUser.deletedAt).length]));
      assert(counts.customer>=20&&counts.technician>=50&&counts.merchant_owner>=5);
      contactResults.push({identity:identity.type,apiCount:contacts.length,counts});
      if(identity.type==='merchant_owner'){
        const query=new URLSearchParams({from:plan.startDate+'T00:00:00+09:00',to:plan.startDate+'T23:59:59+09:00',page:'1',pageSize:'100'});
        const schedules=await request('/merchant-admin/schedule/slots?'+query,auth.accessToken);
        assert(schedules.total>=240);
      }
    }
    const shop=await request('/shops/'+shopId);
    const roster=shop.technicians;
    assert(roster.length>=50,'Affiliated technicians missing from shop detail');
    assert(roster.filter(t=>t.avatarUrl).length>=50,'Missing persisted technician avatars');
    await request('/auth/logout',auth.accessToken,{refreshToken:auth.refreshToken});
    console.log(JSON.stringify({account:account.email,shopId,days:181,verifiedHourlyPeriods:periods.size,minOnDuty:10,minimumFullHourSlotCoverage,newAvailability:availability.length,newSlots:slotIds.length,roster:roster.length,avatars:roster.filter(t=>t.avatarUrl).length,contacts:contactResults}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(disconnectPrisma);

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planContactGraph } = require('./staging-contact-graph.cjs');
const users = [1,2].map(id => ({ id: id+100, accountNo: id, email: `${id}@test.invalid`, isTestAccount: true, isActive: true, deletedAt: null, identities: [{ id: id+200, type:'customer', scopeType:'customer', isActive:true, deletedAt:null, publicIdentifier:null }] }));
const edge = {ownerAccountNo:1,targetAccountNo:2,ownerType:'customer',targetType:'customer',ownerScopeType:'customer',targetScopeType:'customer',ownerIdentityActive:true,targetIdentityActive:true,nickname:null};
const bundle = {version:1,users:users.map(({accountNo,email})=>({accountNo,email})),contacts:[edge]};
test('maps local accounts to destination identities, never source internal IDs',()=>{
 assert.deepEqual(planContactGraph(bundle,users,[]).additions,[{ownerUserId:101,ownerIdentityId:201,contactUserId:102,contactIdentityId:202,nickname:null,source:'staging_test_account_sync'}]);
});
test('preserves deleted or blocked destination relationships and is idempotent',()=>{
 const rows=[{ownerIdentityId:201,contactIdentityId:202,deletedAt:new Date(),blockedAt:new Date()}];
 assert.equal(planContactGraph(bundle,users,rows).additions.length,0);
 assert.equal(planContactGraph(bundle,users,planContactGraph(bundle,users,[]).additions).additions.length,0);
});
test('fails closed on mismatched account or ambiguous identity',()=>{
 assert.throws(()=>planContactGraph(bundle,[{...users[0],email:'changed'},users[1]],[]),/account_batch/);
 assert.throws(()=>planContactGraph(bundle,[{...users[0],identities:[...users[0].identities,...users[0].identities]},users[1]],[]),/identity_mapping/);
});
test('does not recreate blocked source contacts',()=>{
 assert.equal(planContactGraph({...bundle,contacts:[{...edge,blockedAt:new Date()}]},users,[]).additions.length,0);
});

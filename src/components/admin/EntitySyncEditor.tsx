import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { updateCustomerEntity, updateStoreEntity, updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import type { Customer, Store, Technician } from "../../types/domain";

const inputClassName =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-moss";
const textareaClassName =
  "min-h-[92px] w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold leading-6 text-ink outline-none transition focus:border-moss";

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n，、/]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function formatList(value?: string[]) {
  return value?.join("、") ?? "";
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Field({
  children,
  helper,
  label
}: {
  children: ReactNode;
  helper?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-ink/55">{label}</span>
      <div className="mt-1.5">{children}</div>
      {helper ? <span className="mt-1 block text-[11px] font-semibold leading-5 text-ink/42">{helper}</span> : null}
    </label>
  );
}

function SyncResult({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <div className="rounded-lg border border-moss/20 bg-mint/10 px-3 py-2 text-xs font-black leading-5 text-moss">
      {message}
    </div>
  );
}

export function StoreEntitySyncEditor({ store }: { store: Store }) {
  const [name, setName] = useState(store.name);
  const [area, setArea] = useState(store.area);
  const [address, setAddress] = useState(store.address);
  const [businessHours, setBusinessHours] = useState(store.businessHours);
  const [priceLabel, setPriceLabel] = useState(store.priceLabel);
  const [rankLabel, setRankLabel] = useState(store.rankLabel);
  const [nextSlot, setNextSlot] = useState(store.nextSlot);
  const [openStatus, setOpenStatus] = useState<Store["openStatus"]>(store.openStatus);
  const [tags, setTags] = useState(formatList(store.tags));
  const [description, setDescription] = useState(store.description);
  const [cover, setCover] = useState(store.cover);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(store.name);
    setArea(store.area);
    setAddress(store.address);
    setBusinessHours(store.businessHours);
    setPriceLabel(store.priceLabel);
    setRankLabel(store.rankLabel);
    setNextSlot(store.nextSlot);
    setOpenStatus(store.openStatus);
    setTags(formatList(store.tags));
    setDescription(store.description);
    setCover(store.cover);
  }, [
    store.address,
    store.area,
    store.businessHours,
    store.cover,
    store.description,
    store.id,
    store.name,
    store.nextSlot,
    store.openStatus,
    store.priceLabel,
    store.rankLabel,
    store.tags
  ]);

  const save = () => {
    const saved = updateStoreEntity(store.id, {
      name,
      area,
      address,
      businessHours,
      priceLabel,
      rankLabel,
      nextSlot,
      openStatus,
      tags: splitList(tags),
      description,
      cover
    });

    setMessage(saved ? "已保存到共享实体仓库，用户端、商户端、技师端和产运后台会同步刷新。" : "保存失败：没有找到这家门店。");
  };

  return (
    <section className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black">门店共享资料</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">这里保存的是前台详情页、搜索页、商户后台和数据中心共用的门店资料。</p>
        </div>
        <Button onClick={save} size="sm">保存并同步</Button>
      </div>
      <SyncResult message={message} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="门店名称">
          <input className={inputClassName} onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field label="营业状态">
          <select className={inputClassName} onChange={(event) => setOpenStatus(event.target.value as Store["openStatus"])} value={openStatus}>
            <option value="open">营业中</option>
            <option value="resting">临时休息</option>
            <option value="closed">已关闭</option>
          </select>
        </Field>
        <Field label="区域">
          <input className={inputClassName} onChange={(event) => setArea(event.target.value)} value={area} />
        </Field>
        <Field label="营业时间">
          <input className={inputClassName} onChange={(event) => setBusinessHours(event.target.value)} value={businessHours} />
        </Field>
        <Field label="价格标签">
          <input className={inputClassName} onChange={(event) => setPriceLabel(event.target.value)} value={priceLabel} />
        </Field>
        <Field label="等级标签">
          <input className={inputClassName} onChange={(event) => setRankLabel(event.target.value)} value={rankLabel} />
        </Field>
        <Field label="最近可约">
          <input className={inputClassName} onChange={(event) => setNextSlot(event.target.value)} value={nextSlot} />
        </Field>
        <Field label="封面 URL">
          <input className={inputClassName} onChange={(event) => setCover(event.target.value)} value={cover} />
        </Field>
      </div>
      <Field label="地址">
        <input className={inputClassName} onChange={(event) => setAddress(event.target.value)} value={address} />
      </Field>
      <Field helper="用顿号、逗号或换行分隔，会同步到搜索和资料卡。" label="标签">
        <textarea className={textareaClassName} onChange={(event) => setTags(event.target.value)} value={tags} />
      </Field>
      <Field label="门店介绍">
        <textarea className={textareaClassName} onChange={(event) => setDescription(event.target.value)} value={description} />
      </Field>
    </section>
  );
}

export function TechnicianEntitySyncEditor({ technician }: { technician: Technician }) {
  const { stores } = useEntityStore();
  const [name, setName] = useState(technician.name);
  const [nickname, setNickname] = useState(technician.nickname ?? "");
  const [storeId, setStoreId] = useState(technician.storeId);
  const [status, setStatus] = useState<Technician["status"]>(technician.status);
  const [role, setRole] = useState<Technician["role"]>(technician.role);
  const [avatar, setAvatar] = useState(technician.avatar);
  const [skills, setSkills] = useState(formatList(technician.skills));
  const [serviceAreas, setServiceAreas] = useState(formatList(technician.serviceAreas));
  const [languages, setLanguages] = useState(formatList(technician.languages));
  const [rating, setRating] = useState(String(technician.rating));
  const [acceptRate, setAcceptRate] = useState(String(technician.acceptRate));
  const [bio, setBio] = useState(technician.bio ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(technician.name);
    setNickname(technician.nickname ?? "");
    setStoreId(technician.storeId);
    setStatus(technician.status);
    setRole(technician.role);
    setAvatar(technician.avatar);
    setSkills(formatList(technician.skills));
    setServiceAreas(formatList(technician.serviceAreas));
    setLanguages(formatList(technician.languages));
    setRating(String(technician.rating));
    setAcceptRate(String(technician.acceptRate));
    setBio(technician.bio ?? "");
  }, [
    technician.acceptRate,
    technician.avatar,
    technician.bio,
    technician.id,
    technician.languages,
    technician.name,
    technician.nickname,
    technician.rating,
    technician.role,
    technician.serviceAreas,
    technician.skills,
    technician.status,
    technician.storeId
  ]);

  const save = () => {
    const saved = updateTechnicianEntity(technician.id, {
      name,
      nickname,
      storeId,
      status,
      role,
      avatar,
      skills: splitList(skills),
      serviceAreas: splitList(serviceAreas),
      languages: splitList(languages),
      rating: parseNumber(rating, technician.rating),
      acceptRate: parseNumber(acceptRate, technician.acceptRate),
      bio
    });

    setMessage(saved ? "已保存到共享实体仓库，技师端、商户端、用户端展示和产运后台会同步刷新。" : "保存失败：没有找到这位技师。");
  };

  return (
    <section className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black">技师共享资料</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">保存后会影响技师端我的页、商户人员管理、用户端资料卡和平台榜单。</p>
        </div>
        <Button onClick={save} size="sm">保存并同步</Button>
      </div>
      <SyncResult message={message} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="真实姓名">
          <input className={inputClassName} onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field label="显示昵称">
          <input className={inputClassName} onChange={(event) => setNickname(event.target.value)} value={nickname} />
        </Field>
        <Field label="所属门店">
          <select className={inputClassName} onChange={(event) => setStoreId(event.target.value)} value={storeId}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </Field>
        <Field label="接单状态">
          <select className={inputClassName} onChange={(event) => setStatus(event.target.value as Technician["status"])} value={status}>
            <option value="available">空闲</option>
            <option value="busy">服务中</option>
            <option value="off">休息</option>
          </select>
        </Field>
        <Field label="职位">
          <select className={inputClassName} onChange={(event) => setRole(event.target.value as Technician["role"])} value={role}>
            <option value="storeManager">店长</option>
            <option value="staff">门店员工</option>
            <option value="therapist">护理担当</option>
            <option value="driver">移动担当</option>
            <option value="cleaner">清洁担当</option>
          </select>
        </Field>
        <Field label="评分">
          <input className={inputClassName} inputMode="decimal" onChange={(event) => setRating(event.target.value)} value={rating} />
        </Field>
        <Field label="接单率">
          <input className={inputClassName} inputMode="numeric" onChange={(event) => setAcceptRate(event.target.value)} value={acceptRate} />
        </Field>
        <Field label="头像 URL">
          <input className={inputClassName} onChange={(event) => setAvatar(event.target.value)} value={avatar} />
        </Field>
      </div>
      <Field helper="用顿号、逗号或换行分隔。" label="技能">
        <textarea className={textareaClassName} onChange={(event) => setSkills(event.target.value)} value={skills} />
      </Field>
      <Field helper="用顿号、逗号或换行分隔。" label="服务区域">
        <textarea className={textareaClassName} onChange={(event) => setServiceAreas(event.target.value)} value={serviceAreas} />
      </Field>
      <Field helper="用顿号、逗号或换行分隔。" label="语言">
        <input className={inputClassName} onChange={(event) => setLanguages(event.target.value)} value={languages} />
      </Field>
      <Field label="个性签名 / 介绍">
        <textarea className={textareaClassName} onChange={(event) => setBio(event.target.value)} value={bio} />
      </Field>
    </section>
  );
}

export function CustomerEntitySyncEditor({ customer, embedded = false }: { customer: Customer; embedded?: boolean }) {
  const [name, setName] = useState(customer.name);
  const [nickname, setNickname] = useState(customer.nickname ?? "");
  const [phone, setPhone] = useState(customer.phone);
  const [avatar, setAvatar] = useState(customer.avatar);
  const [memberLevel, setMemberLevel] = useState(customer.memberLevel);
  const [activeScore, setActiveScore] = useState(String(customer.activeScore));
  const [churnRisk, setChurnRisk] = useState<Customer["churnRisk"]>(customer.churnRisk);
  const [tags, setTags] = useState(formatList(customer.tags));
  const [bio, setBio] = useState(customer.bio ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(customer.name);
    setNickname(customer.nickname ?? "");
    setPhone(customer.phone);
    setAvatar(customer.avatar);
    setMemberLevel(customer.memberLevel);
    setActiveScore(String(customer.activeScore));
    setChurnRisk(customer.churnRisk);
    setTags(formatList(customer.tags));
    setBio(customer.bio ?? "");
  }, [
    customer.activeScore,
    customer.avatar,
    customer.bio,
    customer.churnRisk,
    customer.id,
    customer.memberLevel,
    customer.name,
    customer.nickname,
    customer.phone,
    customer.tags
  ]);

  const save = () => {
    const saved = updateCustomerEntity(customer.id, {
      name,
      nickname,
      phone,
      avatar,
      memberLevel,
      activeScore: parseNumber(activeScore, customer.activeScore),
      churnRisk,
      tags: splitList(tags),
      bio
    });

    setMessage(saved ? "已保存到共享实体仓库，用户端我的页、聊天资料卡、CRM 和数据中心会同步刷新。" : "保存失败：没有找到这位用户。");
  };

  return (
    <section className={embedded ? "space-y-4" : "space-y-4 rounded-lg border border-line bg-paper p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black">用户共享资料</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">保存后会影响用户端资料、后台 CRM、订单资料解析和聊天信息卡。</p>
        </div>
        <Button onClick={save} size="sm">保存并同步</Button>
      </div>
      <SyncResult message={message} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="姓名">
          <input className={inputClassName} onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field label="昵称">
          <input className={inputClassName} onChange={(event) => setNickname(event.target.value)} value={nickname} />
        </Field>
        <Field label="手机号">
          <input className={inputClassName} onChange={(event) => setPhone(event.target.value)} value={phone} />
        </Field>
        <Field label="会员种类">
          <input className={inputClassName} onChange={(event) => setMemberLevel(event.target.value)} value={memberLevel} />
        </Field>
        <Field label="活跃评分">
          <input className={inputClassName} inputMode="numeric" onChange={(event) => setActiveScore(event.target.value)} value={activeScore} />
        </Field>
        <Field label="流失风险">
          <select className={inputClassName} onChange={(event) => setChurnRisk(event.target.value as Customer["churnRisk"])} value={churnRisk}>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
        </Field>
      </div>
      <Field label="头像 URL">
        <input className={inputClassName} onChange={(event) => setAvatar(event.target.value)} value={avatar} />
      </Field>
      <Field helper="用顿号、逗号或换行分隔。" label="标签">
        <textarea className={textareaClassName} onChange={(event) => setTags(event.target.value)} value={tags} />
      </Field>
      <Field label="自我介绍">
        <textarea className={textareaClassName} onChange={(event) => setBio(event.target.value)} value={bio} />
      </Field>
    </section>
  );
}

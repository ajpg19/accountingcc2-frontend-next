import { NomenclatorManager } from "@/components/nomenclatures/nomenclator-manager";

export default function MembersNomenclaturePage() {
  return (
    <NomenclatorManager
      table="members"
      usageColumn="assigned_member_id"
      label="miembro"
      withEmail
    />
  );
}

import { NomenclatorManager } from "@/components/nomenclatures/nomenclator-manager";

export default function CategoriesNomenclaturePage() {
  return (
    <NomenclatorManager
      table="categories"
      usageColumn="category_id"
      label="categoría"
    />
  );
}

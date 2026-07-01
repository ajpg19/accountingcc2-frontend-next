export type Category = {
  id: string;
  name: string;
  color: string;
};

export type Member = {
  id: string;
  name: string;
  email: string | null;
  color: string;
};

export type Transaction = {
  id: string;
  type: "expense" | "income";
  amount: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  occurred_on: string;
  category_id: string | null;
  assigned_member_id: string | null;
  source: "manual" | "receipt" | "csv";
  created_at: string;
  categories?: Category | null;
  members?: Member | null;
};

export type ReceiptItem = {
  description: string;
  reference?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  color?: string;
  material?: string;
  model?: string;
  category?: string;
  attributes?: Record<string, unknown>;
};

export type ExtractedReceipt = {
  merchant: string;
  receipt_date?: string;
  total_amount: number;
  tax_amount?: number;
  currency?: string;
  raw_text?: string;
  line_items: ReceiptItem[];
};

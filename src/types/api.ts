export type User = {
  id: number;
  username: string;
  full_name?: string;
  email?: string;
  branch_id?: number;
  organization_id?: number;
  is_admin?: boolean;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type Capabilities = {
  organization_id?: number;
  deployment_profile: string;
  profile_label?: string;
  modules: Record<string, boolean>;
  channels: string[];
  workflows: Record<string, unknown>;
  module_settings: Record<string, unknown>;
};

export type Paginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type Product = {
  product_code: string;
  product_name: string;
  unit_price: number;
  stock_in_shop?: number;
  stock_in_store?: number;
};

export type Employee = {
  id: number;
  organization_id: number;
  department_id?: number;
  employee_code?: string;
  full_name: string;
  job_title?: string;
  base_salary?: number;
  is_active?: boolean;
};

export type TemporaryCart = {
  id: number;
  channel: string;
  branch_id?: number;
  user_id: number;
  lines?: CartLine[];
};

export type CartLine = {
  id: number;
  product_code: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type Sale = {
  id: number;
  order_num: number;
  status: string;
  order_total: number;
  payment_status: string;
  stock_balanced?: number;
};

export type ReportCatalog = {
  sales: { key: string; path: string; label: string }[];
  inventory: { key: string; path: string; label: string }[];
  finance: { key: string; path: string; label: string }[];
  operations: { key: string; path: string; label: string }[];
  customer: { key: string; path: string; label: string }[];
  filters: string[];
};

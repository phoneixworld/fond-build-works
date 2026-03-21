// src/lib/ir.ts

export type FieldType = "string" | "number" | "boolean" | "date" | "relation";

export interface IREntityField {
  type: FieldType;
  required?: boolean;
  relation?: { entity: string; type: "one" | "many" };
}

export interface IREntity {
  fields: Record<string, IREntityField>;
  flows: Array<"list" | "view" | "create" | "edit" | "delete" | string>;
}

export interface IRPage {
  name: string;
  type: "list" | "view" | "edit" | "create" | "dashboard" | "custom";
  entity?: string;
  path: string;
}

export interface IRNavItem {
  label: string;
  path: string;
  icon?: string;
}

export interface IRContext {
  name: string;
  provides: string[];
}

export interface IR {
  entities: Record<string, IREntity>;
  pages: IRPage[];
  navigation: IRNavItem[];
  components: string[];
  contexts: IRContext[];
  mockApi: Record<string, {
    list: string;
    create: string;
    update: string;
    delete: string;
  }>;
  backend?: {
    provider: "supabase" | "none";
    config?: any;
  };
}

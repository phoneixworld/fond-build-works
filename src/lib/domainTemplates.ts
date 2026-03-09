/**
 * Domain Templates — pre-built entity models for common app types.
 * 
 * The Requirements Agent uses these as a starting point, then customizes
 * via AI based on the specific user prompt.
 */

export interface DomainField {
  name: string;
  type: "text" | "number" | "boolean" | "datetime" | "email" | "url" | "textarea" | "select" | "json";
  required: boolean;
  default?: any;
  options?: string[]; // for select type
}

export interface DomainRelationship {
  target: string;
  type: "hasMany" | "belongsTo" | "hasOne" | "manyToMany";
  foreignKey?: string;
}

export interface DomainEntity {
  name: string;
  pluralName: string;
  fields: DomainField[];
  relationships: DomainRelationship[];
  seedCount: number; // how many mock records to generate
}

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  entity: string;
  action: "list" | "get" | "create" | "update" | "delete" | "search";
  description: string;
}

export interface DomainModel {
  templateId: string;
  templateName: string;
  entities: DomainEntity[];
  requiresAuth: boolean;
  apiEndpoints: ApiEndpoint[];
  suggestedPages: Array<{
    path: string;
    title: string;
    entity?: string;
    type: "list" | "detail" | "form" | "dashboard" | "static";
  }>;
  suggestedNavItems: Array<{
    label: string;
    path: string;
    icon: string; // lucide icon name
  }>;
}

export interface DomainTemplate {
  id: string;
  name: string;
  keywords: string[];
  model: DomainModel;
}

// ─── E-Commerce Template ──────────────────────────────────────────────────

const ecommerceTemplate: DomainTemplate = {
  id: "ecommerce",
  name: "E-Commerce Store",
  keywords: ["ecommerce", "e-commerce", "shop", "store", "product", "cart", "checkout", "order", "buy", "sell", "marketplace", "catalog"],
  model: {
    templateId: "ecommerce",
    templateName: "E-Commerce Store",
    requiresAuth: true,
    entities: [
      {
        name: "Product",
        pluralName: "products",
        seedCount: 12,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "textarea", required: true },
          { name: "price", type: "number", required: true },
          { name: "compareAtPrice", type: "number", required: false },
          { name: "image", type: "url", required: true },
          { name: "category", type: "select", required: true, options: ["Electronics", "Clothing", "Home", "Books", "Sports"] },
          { name: "inStock", type: "boolean", required: true, default: true },
          { name: "rating", type: "number", required: false, default: 0 },
          { name: "reviewCount", type: "number", required: false, default: 0 },
          { name: "sku", type: "text", required: false },
          { name: "tags", type: "json", required: false, default: [] },
        ],
        relationships: [
          { target: "OrderItem", type: "hasMany" },
          { target: "CartItem", type: "hasMany" },
          { target: "Review", type: "hasMany" },
        ],
      },
      {
        name: "Cart",
        pluralName: "carts",
        seedCount: 0,
        fields: [
          { name: "userId", type: "text", required: true },
          { name: "status", type: "select", required: true, options: ["active", "abandoned", "converted"], default: "active" },
        ],
        relationships: [
          { target: "CartItem", type: "hasMany" },
        ],
      },
      {
        name: "CartItem",
        pluralName: "cartItems",
        seedCount: 0,
        fields: [
          { name: "productId", type: "text", required: true },
          { name: "quantity", type: "number", required: true, default: 1 },
          { name: "price", type: "number", required: true },
        ],
        relationships: [
          { target: "Cart", type: "belongsTo", foreignKey: "cartId" },
          { target: "Product", type: "belongsTo", foreignKey: "productId" },
        ],
      },
      {
        name: "Order",
        pluralName: "orders",
        seedCount: 5,
        fields: [
          { name: "userId", type: "text", required: true },
          { name: "status", type: "select", required: true, options: ["pending", "processing", "shipped", "delivered", "cancelled"], default: "pending" },
          { name: "total", type: "number", required: true },
          { name: "shippingAddress", type: "json", required: true },
          { name: "paymentMethod", type: "text", required: false },
          { name: "trackingNumber", type: "text", required: false },
          { name: "notes", type: "textarea", required: false },
        ],
        relationships: [
          { target: "OrderItem", type: "hasMany" },
        ],
      },
      {
        name: "OrderItem",
        pluralName: "orderItems",
        seedCount: 0,
        fields: [
          { name: "productId", type: "text", required: true },
          { name: "productName", type: "text", required: true },
          { name: "quantity", type: "number", required: true },
          { name: "price", type: "number", required: true },
        ],
        relationships: [
          { target: "Order", type: "belongsTo", foreignKey: "orderId" },
          { target: "Product", type: "belongsTo", foreignKey: "productId" },
        ],
      },
      {
        name: "Review",
        pluralName: "reviews",
        seedCount: 8,
        fields: [
          { name: "userId", type: "text", required: true },
          { name: "userName", type: "text", required: true },
          { name: "rating", type: "number", required: true },
          { name: "comment", type: "textarea", required: true },
          { name: "productId", type: "text", required: true },
        ],
        relationships: [
          { target: "Product", type: "belongsTo", foreignKey: "productId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/products", entity: "Product", action: "list", description: "List all products with filtering" },
      { method: "GET", path: "/products/:id", entity: "Product", action: "get", description: "Get single product details" },
      { method: "GET", path: "/products/search", entity: "Product", action: "search", description: "Search products" },
      { method: "GET", path: "/cart", entity: "Cart", action: "get", description: "Get current user's cart" },
      { method: "POST", path: "/cart/items", entity: "CartItem", action: "create", description: "Add item to cart" },
      { method: "PUT", path: "/cart/items/:id", entity: "CartItem", action: "update", description: "Update cart item quantity" },
      { method: "DELETE", path: "/cart/items/:id", entity: "CartItem", action: "delete", description: "Remove item from cart" },
      { method: "POST", path: "/orders", entity: "Order", action: "create", description: "Place an order" },
      { method: "GET", path: "/orders", entity: "Order", action: "list", description: "List user's orders" },
      { method: "GET", path: "/orders/:id", entity: "Order", action: "get", description: "Get order details" },
    ],
    suggestedPages: [
      { path: "/", title: "Home", type: "static" },
      { path: "/products", title: "Shop", entity: "Product", type: "list" },
      { path: "/products/:id", title: "Product Detail", entity: "Product", type: "detail" },
      { path: "/cart", title: "Shopping Cart", entity: "Cart", type: "detail" },
      { path: "/checkout", title: "Checkout", entity: "Order", type: "form" },
      { path: "/orders", title: "Order History", entity: "Order", type: "list" },
      { path: "/orders/:id", title: "Order Detail", entity: "Order", type: "detail" },
      { path: "/about", title: "About", type: "static" },
    ],
    suggestedNavItems: [
      { label: "Home", path: "/", icon: "Home" },
      { label: "Shop", path: "/products", icon: "ShoppingBag" },
      { label: "Cart", path: "/cart", icon: "ShoppingCart" },
      { label: "Orders", path: "/orders", icon: "Package" },
      { label: "About", path: "/about", icon: "Info" },
    ],
  },
};

// ─── School / ERP Template ────────────────────────────────────────────────

const schoolErpTemplate: DomainTemplate = {
  id: "school-erp",
  name: "School ERP",
  keywords: ["school", "erp", "student", "teacher", "education", "lms", "learning", "academy", "university", "college", "attendance", "timetable", "grade"],
  model: {
    templateId: "school-erp",
    templateName: "School ERP",
    requiresAuth: true,
    entities: [
      {
        name: "Student",
        pluralName: "students",
        seedCount: 15,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "email", type: "email", required: true },
          { name: "rollNumber", type: "text", required: true },
          { name: "class", type: "text", required: true },
          { name: "section", type: "text", required: false },
          { name: "parentName", type: "text", required: false },
          { name: "parentPhone", type: "text", required: false },
          { name: "admissionDate", type: "datetime", required: true },
          { name: "status", type: "select", required: true, options: ["active", "inactive", "graduated", "transferred"], default: "active" },
        ],
        relationships: [
          { target: "Attendance", type: "hasMany" },
          { target: "Fee", type: "hasMany" },
          { target: "Grade", type: "hasMany" },
        ],
      },
      {
        name: "Staff",
        pluralName: "staff",
        seedCount: 8,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "email", type: "email", required: true },
          { name: "role", type: "select", required: true, options: ["teacher", "admin", "principal", "counselor"] },
          { name: "department", type: "text", required: false },
          { name: "phone", type: "text", required: false },
          { name: "joinDate", type: "datetime", required: true },
          { name: "salary", type: "number", required: false },
        ],
        relationships: [
          { target: "Timetable", type: "hasMany" },
        ],
      },
      {
        name: "Attendance",
        pluralName: "attendance",
        seedCount: 30,
        fields: [
          { name: "studentId", type: "text", required: true },
          { name: "date", type: "datetime", required: true },
          { name: "status", type: "select", required: true, options: ["present", "absent", "late", "excused"] },
          { name: "remarks", type: "text", required: false },
        ],
        relationships: [
          { target: "Student", type: "belongsTo", foreignKey: "studentId" },
        ],
      },
      {
        name: "Fee",
        pluralName: "fees",
        seedCount: 10,
        fields: [
          { name: "studentId", type: "text", required: true },
          { name: "amount", type: "number", required: true },
          { name: "type", type: "select", required: true, options: ["tuition", "exam", "transport", "lab", "library"] },
          { name: "dueDate", type: "datetime", required: true },
          { name: "paidDate", type: "datetime", required: false },
          { name: "status", type: "select", required: true, options: ["pending", "paid", "overdue", "waived"], default: "pending" },
        ],
        relationships: [
          { target: "Student", type: "belongsTo", foreignKey: "studentId" },
        ],
      },
      {
        name: "Timetable",
        pluralName: "timetable",
        seedCount: 20,
        fields: [
          { name: "class", type: "text", required: true },
          { name: "subject", type: "text", required: true },
          { name: "teacherId", type: "text", required: true },
          { name: "day", type: "select", required: true, options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
          { name: "startTime", type: "text", required: true },
          { name: "endTime", type: "text", required: true },
          { name: "room", type: "text", required: false },
        ],
        relationships: [
          { target: "Staff", type: "belongsTo", foreignKey: "teacherId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/students", entity: "Student", action: "list", description: "List all students" },
      { method: "POST", path: "/students", entity: "Student", action: "create", description: "Add new student" },
      { method: "PUT", path: "/students/:id", entity: "Student", action: "update", description: "Update student" },
      { method: "GET", path: "/attendance", entity: "Attendance", action: "list", description: "View attendance" },
      { method: "POST", path: "/attendance", entity: "Attendance", action: "create", description: "Mark attendance" },
      { method: "GET", path: "/fees", entity: "Fee", action: "list", description: "View fees" },
      { method: "POST", path: "/fees", entity: "Fee", action: "create", description: "Create fee record" },
      { method: "PUT", path: "/fees/:id", entity: "Fee", action: "update", description: "Update fee status" },
      { method: "GET", path: "/timetable", entity: "Timetable", action: "list", description: "View timetable" },
      { method: "GET", path: "/staff", entity: "Staff", action: "list", description: "List staff" },
    ],
    suggestedPages: [
      { path: "/dashboard", title: "Dashboard", type: "dashboard" },
      { path: "/students", title: "Students", entity: "Student", type: "list" },
      { path: "/staff", title: "Staff", entity: "Staff", type: "list" },
      { path: "/attendance", title: "Attendance", entity: "Attendance", type: "list" },
      { path: "/fees", title: "Fee Management", entity: "Fee", type: "list" },
      { path: "/timetable", title: "Timetable", entity: "Timetable", type: "list" },
    ],
    suggestedNavItems: [
      { label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard" },
      { label: "Students", path: "/students", icon: "Users" },
      { label: "Staff", path: "/staff", icon: "UserCog" },
      { label: "Attendance", path: "/attendance", icon: "CalendarCheck" },
      { label: "Fees", path: "/fees", icon: "DollarSign" },
      { label: "Timetable", path: "/timetable", icon: "Clock" },
    ],
  },
};

// ─── CRM Template ─────────────────────────────────────────────────────────

const crmTemplate: DomainTemplate = {
  id: "crm",
  name: "CRM",
  keywords: ["crm", "customer", "lead", "contact", "deal", "pipeline", "sales", "client", "relationship"],
  model: {
    templateId: "crm",
    templateName: "CRM",
    requiresAuth: true,
    entities: [
      {
        name: "Contact",
        pluralName: "contacts",
        seedCount: 20,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "email", type: "email", required: true },
          { name: "phone", type: "text", required: false },
          { name: "company", type: "text", required: false },
          { name: "title", type: "text", required: false },
          { name: "source", type: "select", required: false, options: ["Website", "Referral", "LinkedIn", "Cold Call", "Event"] },
          { name: "notes", type: "textarea", required: false },
        ],
        relationships: [
          { target: "Deal", type: "hasMany" },
          { target: "Activity", type: "hasMany" },
        ],
      },
      {
        name: "Deal",
        pluralName: "deals",
        seedCount: 10,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "value", type: "number", required: true },
          { name: "stage", type: "select", required: true, options: ["Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"], default: "Lead" },
          { name: "contactId", type: "text", required: true },
          { name: "expectedCloseDate", type: "datetime", required: false },
          { name: "probability", type: "number", required: false },
          { name: "notes", type: "textarea", required: false },
        ],
        relationships: [
          { target: "Contact", type: "belongsTo", foreignKey: "contactId" },
          { target: "Activity", type: "hasMany" },
        ],
      },
      {
        name: "Activity",
        pluralName: "activities",
        seedCount: 15,
        fields: [
          { name: "type", type: "select", required: true, options: ["call", "email", "meeting", "note", "task"] },
          { name: "subject", type: "text", required: true },
          { name: "description", type: "textarea", required: false },
          { name: "contactId", type: "text", required: false },
          { name: "dealId", type: "text", required: false },
          { name: "dueDate", type: "datetime", required: false },
          { name: "completed", type: "boolean", required: false, default: false },
        ],
        relationships: [
          { target: "Contact", type: "belongsTo", foreignKey: "contactId" },
          { target: "Deal", type: "belongsTo", foreignKey: "dealId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/contacts", entity: "Contact", action: "list", description: "List contacts" },
      { method: "POST", path: "/contacts", entity: "Contact", action: "create", description: "Create contact" },
      { method: "PUT", path: "/contacts/:id", entity: "Contact", action: "update", description: "Update contact" },
      { method: "GET", path: "/deals", entity: "Deal", action: "list", description: "List deals" },
      { method: "POST", path: "/deals", entity: "Deal", action: "create", description: "Create deal" },
      { method: "PUT", path: "/deals/:id", entity: "Deal", action: "update", description: "Update deal stage" },
      { method: "GET", path: "/activities", entity: "Activity", action: "list", description: "List activities" },
      { method: "POST", path: "/activities", entity: "Activity", action: "create", description: "Log activity" },
    ],
    suggestedPages: [
      { path: "/dashboard", title: "Dashboard", type: "dashboard" },
      { path: "/contacts", title: "Contacts", entity: "Contact", type: "list" },
      { path: "/contacts/:id", title: "Contact Detail", entity: "Contact", type: "detail" },
      { path: "/deals", title: "Pipeline", entity: "Deal", type: "list" },
      { path: "/activities", title: "Activities", entity: "Activity", type: "list" },
    ],
    suggestedNavItems: [
      { label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard" },
      { label: "Contacts", path: "/contacts", icon: "Users" },
      { label: "Pipeline", path: "/deals", icon: "Kanban" },
      { label: "Activities", path: "/activities", icon: "Activity" },
    ],
  },
};

// ─── Project Management Template ──────────────────────────────────────────

const projectMgmtTemplate: DomainTemplate = {
  id: "project-management",
  name: "Project Management",
  keywords: ["project", "task", "kanban", "board", "sprint", "agile", "scrum", "todo", "issue", "tracker", "jira", "trello"],
  model: {
    templateId: "project-management",
    templateName: "Project Management",
    requiresAuth: true,
    entities: [
      {
        name: "Project",
        pluralName: "projects",
        seedCount: 3,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "textarea", required: false },
          { name: "status", type: "select", required: true, options: ["active", "on-hold", "completed", "archived"], default: "active" },
          { name: "startDate", type: "datetime", required: false },
          { name: "endDate", type: "datetime", required: false },
          { name: "color", type: "text", required: false, default: "#6366f1" },
        ],
        relationships: [
          { target: "Task", type: "hasMany" },
        ],
      },
      {
        name: "Task",
        pluralName: "tasks",
        seedCount: 20,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "description", type: "textarea", required: false },
          { name: "status", type: "select", required: true, options: ["todo", "in-progress", "review", "done"], default: "todo" },
          { name: "priority", type: "select", required: true, options: ["low", "medium", "high", "urgent"], default: "medium" },
          { name: "projectId", type: "text", required: true },
          { name: "assignee", type: "text", required: false },
          { name: "dueDate", type: "datetime", required: false },
          { name: "labels", type: "json", required: false, default: [] },
        ],
        relationships: [
          { target: "Project", type: "belongsTo", foreignKey: "projectId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/projects", entity: "Project", action: "list", description: "List projects" },
      { method: "POST", path: "/projects", entity: "Project", action: "create", description: "Create project" },
      { method: "GET", path: "/tasks", entity: "Task", action: "list", description: "List tasks" },
      { method: "POST", path: "/tasks", entity: "Task", action: "create", description: "Create task" },
      { method: "PUT", path: "/tasks/:id", entity: "Task", action: "update", description: "Update task" },
      { method: "DELETE", path: "/tasks/:id", entity: "Task", action: "delete", description: "Delete task" },
    ],
    suggestedPages: [
      { path: "/dashboard", title: "Dashboard", type: "dashboard" },
      { path: "/projects", title: "Projects", entity: "Project", type: "list" },
      { path: "/board", title: "Board", entity: "Task", type: "list" },
      { path: "/tasks", title: "Tasks", entity: "Task", type: "list" },
    ],
    suggestedNavItems: [
      { label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard" },
      { label: "Projects", path: "/projects", icon: "FolderKanban" },
      { label: "Board", path: "/board", icon: "Kanban" },
      { label: "Tasks", path: "/tasks", icon: "CheckSquare" },
    ],
  },
};

// ─── Blog / CMS Template ─────────────────────────────────────────────────

const blogTemplate: DomainTemplate = {
  id: "blog",
  name: "Blog / CMS",
  keywords: ["blog", "cms", "content", "article", "post", "publish", "writer", "editorial", "magazine", "news"],
  model: {
    templateId: "blog",
    templateName: "Blog / CMS",
    requiresAuth: true,
    entities: [
      {
        name: "Post",
        pluralName: "posts",
        seedCount: 8,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "slug", type: "text", required: true },
          { name: "content", type: "textarea", required: true },
          { name: "excerpt", type: "textarea", required: false },
          { name: "coverImage", type: "url", required: false },
          { name: "category", type: "select", required: true, options: ["Technology", "Design", "Business", "Lifestyle"] },
          { name: "tags", type: "json", required: false, default: [] },
          { name: "status", type: "select", required: true, options: ["draft", "published", "archived"], default: "draft" },
          { name: "authorName", type: "text", required: true },
          { name: "publishedAt", type: "datetime", required: false },
        ],
        relationships: [
          { target: "Comment", type: "hasMany" },
        ],
      },
      {
        name: "Comment",
        pluralName: "comments",
        seedCount: 15,
        fields: [
          { name: "postId", type: "text", required: true },
          { name: "authorName", type: "text", required: true },
          { name: "content", type: "textarea", required: true },
          { name: "approved", type: "boolean", required: true, default: false },
        ],
        relationships: [
          { target: "Post", type: "belongsTo", foreignKey: "postId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/posts", entity: "Post", action: "list", description: "List posts" },
      { method: "GET", path: "/posts/:slug", entity: "Post", action: "get", description: "Get post by slug" },
      { method: "POST", path: "/posts", entity: "Post", action: "create", description: "Create post" },
      { method: "PUT", path: "/posts/:id", entity: "Post", action: "update", description: "Update post" },
      { method: "GET", path: "/comments", entity: "Comment", action: "list", description: "List comments" },
      { method: "POST", path: "/comments", entity: "Comment", action: "create", description: "Add comment" },
    ],
    suggestedPages: [
      { path: "/", title: "Home", type: "static" },
      { path: "/blog", title: "Blog", entity: "Post", type: "list" },
      { path: "/blog/:slug", title: "Post", entity: "Post", type: "detail" },
      { path: "/admin/posts", title: "Manage Posts", entity: "Post", type: "list" },
      { path: "/admin/posts/new", title: "New Post", entity: "Post", type: "form" },
    ],
    suggestedNavItems: [
      { label: "Home", path: "/", icon: "Home" },
      { label: "Blog", path: "/blog", icon: "FileText" },
      { label: "Dashboard", path: "/admin/posts", icon: "LayoutDashboard" },
    ],
  },
};

// ─── Social / Community Template ──────────────────────────────────────────

const socialTemplate: DomainTemplate = {
  id: "social",
  name: "Social / Community",
  keywords: ["social", "community", "forum", "feed", "profile", "follow", "like", "share", "network", "chat", "messaging"],
  model: {
    templateId: "social",
    templateName: "Social / Community",
    requiresAuth: true,
    entities: [
      {
        name: "UserProfile",
        pluralName: "userProfiles",
        seedCount: 10,
        fields: [
          { name: "displayName", type: "text", required: true },
          { name: "bio", type: "textarea", required: false },
          { name: "avatar", type: "url", required: false },
          { name: "followersCount", type: "number", required: false, default: 0 },
          { name: "followingCount", type: "number", required: false, default: 0 },
        ],
        relationships: [
          { target: "Post", type: "hasMany" },
        ],
      },
      {
        name: "Post",
        pluralName: "posts",
        seedCount: 20,
        fields: [
          { name: "content", type: "textarea", required: true },
          { name: "image", type: "url", required: false },
          { name: "authorId", type: "text", required: true },
          { name: "authorName", type: "text", required: true },
          { name: "likesCount", type: "number", required: false, default: 0 },
          { name: "commentsCount", type: "number", required: false, default: 0 },
        ],
        relationships: [
          { target: "UserProfile", type: "belongsTo", foreignKey: "authorId" },
          { target: "Comment", type: "hasMany" },
        ],
      },
      {
        name: "Comment",
        pluralName: "comments",
        seedCount: 30,
        fields: [
          { name: "postId", type: "text", required: true },
          { name: "authorId", type: "text", required: true },
          { name: "authorName", type: "text", required: true },
          { name: "content", type: "textarea", required: true },
        ],
        relationships: [
          { target: "Post", type: "belongsTo", foreignKey: "postId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/feed", entity: "Post", action: "list", description: "Get feed" },
      { method: "POST", path: "/posts", entity: "Post", action: "create", description: "Create post" },
      { method: "GET", path: "/profiles/:id", entity: "UserProfile", action: "get", description: "Get profile" },
      { method: "POST", path: "/comments", entity: "Comment", action: "create", description: "Add comment" },
    ],
    suggestedPages: [
      { path: "/", title: "Feed", entity: "Post", type: "list" },
      { path: "/profile/:id", title: "Profile", entity: "UserProfile", type: "detail" },
      { path: "/compose", title: "New Post", entity: "Post", type: "form" },
    ],
    suggestedNavItems: [
      { label: "Feed", path: "/", icon: "Home" },
      { label: "Explore", path: "/explore", icon: "Compass" },
      { label: "Profile", path: "/profile", icon: "User" },
    ],
  },
};

// ─── Restaurant / Food Template ───────────────────────────────────────────

const restaurantTemplate: DomainTemplate = {
  id: "restaurant",
  name: "Restaurant / Food Ordering",
  keywords: ["restaurant", "food", "menu", "order", "delivery", "kitchen", "recipe", "reservation", "booking", "dine", "cafe"],
  model: {
    templateId: "restaurant",
    templateName: "Restaurant / Food Ordering",
    requiresAuth: true,
    entities: [
      {
        name: "MenuItem",
        pluralName: "menuItems",
        seedCount: 20,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "description", type: "textarea", required: true },
          { name: "price", type: "number", required: true },
          { name: "image", type: "url", required: false },
          { name: "category", type: "select", required: true, options: ["Appetizers", "Mains", "Desserts", "Drinks", "Sides"] },
          { name: "isVegetarian", type: "boolean", required: false, default: false },
          { name: "isAvailable", type: "boolean", required: true, default: true },
          { name: "spiceLevel", type: "select", required: false, options: ["Mild", "Medium", "Hot", "Extra Hot"] },
        ],
        relationships: [],
      },
      {
        name: "Order",
        pluralName: "orders",
        seedCount: 5,
        fields: [
          { name: "customerName", type: "text", required: true },
          { name: "items", type: "json", required: true },
          { name: "total", type: "number", required: true },
          { name: "status", type: "select", required: true, options: ["pending", "preparing", "ready", "delivered", "cancelled"], default: "pending" },
          { name: "type", type: "select", required: true, options: ["dine-in", "takeaway", "delivery"] },
          { name: "tableNumber", type: "number", required: false },
        ],
        relationships: [],
      },
      {
        name: "Reservation",
        pluralName: "reservations",
        seedCount: 5,
        fields: [
          { name: "guestName", type: "text", required: true },
          { name: "guestPhone", type: "text", required: true },
          { name: "partySize", type: "number", required: true },
          { name: "date", type: "datetime", required: true },
          { name: "time", type: "text", required: true },
          { name: "status", type: "select", required: true, options: ["confirmed", "cancelled", "completed", "no-show"], default: "confirmed" },
          { name: "notes", type: "textarea", required: false },
        ],
        relationships: [],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/menu", entity: "MenuItem", action: "list", description: "Get menu" },
      { method: "POST", path: "/orders", entity: "Order", action: "create", description: "Place order" },
      { method: "GET", path: "/orders", entity: "Order", action: "list", description: "List orders" },
      { method: "PUT", path: "/orders/:id", entity: "Order", action: "update", description: "Update order status" },
      { method: "POST", path: "/reservations", entity: "Reservation", action: "create", description: "Make reservation" },
      { method: "GET", path: "/reservations", entity: "Reservation", action: "list", description: "List reservations" },
    ],
    suggestedPages: [
      { path: "/", title: "Home", type: "static" },
      { path: "/menu", title: "Menu", entity: "MenuItem", type: "list" },
      { path: "/order", title: "Order", entity: "Order", type: "form" },
      { path: "/reservations", title: "Reservations", entity: "Reservation", type: "list" },
      { path: "/kitchen", title: "Kitchen Dashboard", entity: "Order", type: "dashboard" },
    ],
    suggestedNavItems: [
      { label: "Home", path: "/", icon: "Home" },
      { label: "Menu", path: "/menu", icon: "UtensilsCrossed" },
      { label: "Order", path: "/order", icon: "ShoppingCart" },
      { label: "Reservations", path: "/reservations", icon: "CalendarDays" },
    ],
  },
};

// ─── Healthcare Template ──────────────────────────────────────────────────

const healthcareTemplate: DomainTemplate = {
  id: "healthcare",
  name: "Healthcare / Clinic",
  keywords: ["hospital", "clinic", "patient", "doctor", "appointment", "medical", "health", "pharmacy", "prescription", "healthcare"],
  model: {
    templateId: "healthcare",
    templateName: "Healthcare / Clinic",
    requiresAuth: true,
    entities: [
      {
        name: "Patient",
        pluralName: "patients",
        seedCount: 15,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "email", type: "email", required: true },
          { name: "phone", type: "text", required: true },
          { name: "dateOfBirth", type: "datetime", required: true },
          { name: "bloodGroup", type: "select", required: false, options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
          { name: "allergies", type: "textarea", required: false },
          { name: "address", type: "textarea", required: false },
        ],
        relationships: [
          { target: "Appointment", type: "hasMany" },
        ],
      },
      {
        name: "Doctor",
        pluralName: "doctors",
        seedCount: 6,
        fields: [
          { name: "name", type: "text", required: true },
          { name: "specialization", type: "text", required: true },
          { name: "email", type: "email", required: true },
          { name: "phone", type: "text", required: false },
          { name: "available", type: "boolean", required: true, default: true },
        ],
        relationships: [
          { target: "Appointment", type: "hasMany" },
        ],
      },
      {
        name: "Appointment",
        pluralName: "appointments",
        seedCount: 10,
        fields: [
          { name: "patientId", type: "text", required: true },
          { name: "doctorId", type: "text", required: true },
          { name: "date", type: "datetime", required: true },
          { name: "time", type: "text", required: true },
          { name: "reason", type: "textarea", required: true },
          { name: "status", type: "select", required: true, options: ["scheduled", "in-progress", "completed", "cancelled"], default: "scheduled" },
          { name: "notes", type: "textarea", required: false },
        ],
        relationships: [
          { target: "Patient", type: "belongsTo", foreignKey: "patientId" },
          { target: "Doctor", type: "belongsTo", foreignKey: "doctorId" },
        ],
      },
    ],
    apiEndpoints: [
      { method: "GET", path: "/patients", entity: "Patient", action: "list", description: "List patients" },
      { method: "POST", path: "/patients", entity: "Patient", action: "create", description: "Register patient" },
      { method: "GET", path: "/doctors", entity: "Doctor", action: "list", description: "List doctors" },
      { method: "GET", path: "/appointments", entity: "Appointment", action: "list", description: "List appointments" },
      { method: "POST", path: "/appointments", entity: "Appointment", action: "create", description: "Book appointment" },
      { method: "PUT", path: "/appointments/:id", entity: "Appointment", action: "update", description: "Update appointment" },
    ],
    suggestedPages: [
      { path: "/dashboard", title: "Dashboard", type: "dashboard" },
      { path: "/patients", title: "Patients", entity: "Patient", type: "list" },
      { path: "/doctors", title: "Doctors", entity: "Doctor", type: "list" },
      { path: "/appointments", title: "Appointments", entity: "Appointment", type: "list" },
      { path: "/appointments/new", title: "Book Appointment", entity: "Appointment", type: "form" },
    ],
    suggestedNavItems: [
      { label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard" },
      { label: "Patients", path: "/patients", icon: "Users" },
      { label: "Doctors", path: "/doctors", icon: "Stethoscope" },
      { label: "Appointments", path: "/appointments", icon: "Calendar" },
    ],
  },
};

// ─── All Templates Registry ──────────────────────────────────────────────

export const DOMAIN_TEMPLATES: DomainTemplate[] = [
  ecommerceTemplate,
  schoolErpTemplate,
  crmTemplate,
  projectMgmtTemplate,
  blogTemplate,
  socialTemplate,
  restaurantTemplate,
  healthcareTemplate,
];

/**
 * Match a user prompt against domain templates using keyword scoring.
 * Returns the best match if confidence > threshold.
 */
export function matchDomainTemplate(prompt: string, threshold = 0.3): {
  template: DomainTemplate | null;
  confidence: number;
  matchedKeywords: string[];
} {
  const promptLower = prompt.toLowerCase();
  const promptWords = promptLower.split(/\s+/);

  let bestMatch: DomainTemplate | null = null;
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const template of DOMAIN_TEMPLATES) {
    const matchedKeywords: string[] = [];
    let score = 0;

    for (const keyword of template.keywords) {
      if (promptLower.includes(keyword)) {
        matchedKeywords.push(keyword);
        // Exact word match scores higher
        if (promptWords.includes(keyword)) {
          score += 2;
        } else {
          score += 1;
        }
      }
    }

    // Normalize by total keywords
    const normalizedScore = score / (template.keywords.length * 2);

    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestMatch = template;
      bestKeywords = matchedKeywords;
    }
  }

  return {
    template: bestScore >= threshold ? bestMatch : null,
    confidence: bestScore,
    matchedKeywords: bestKeywords,
  };
}

/**
 * Serialize a domain model to a string context for the build agent.
 * This provides the AI with the full entity structure to generate proper data layers.
 */
export function serializeDomainModel(model: DomainModel): string {
  let result = `## DOMAIN MODEL: ${model.templateName}\n\n`;
  result += `Auth Required: ${model.requiresAuth}\n\n`;

  result += `### Entities\n`;
  for (const entity of model.entities) {
    result += `\n#### ${entity.name} (collection: "${entity.pluralName}")\n`;
    result += `Fields:\n`;
    for (const field of entity.fields) {
      const req = field.required ? "required" : "optional";
      const def = field.default !== undefined ? `, default: ${JSON.stringify(field.default)}` : "";
      const opts = field.options ? `, options: [${field.options.join(", ")}]` : "";
      result += `  - ${field.name}: ${field.type} (${req}${def}${opts})\n`;
    }
    if (entity.relationships.length > 0) {
      result += `Relationships:\n`;
      for (const rel of entity.relationships) {
        result += `  - ${rel.type} ${rel.target}${rel.foreignKey ? ` via ${rel.foreignKey}` : ""}\n`;
      }
    }
    result += `Mock data: generate ${entity.seedCount} realistic records\n`;
  }

  result += `\n### API Endpoints\n`;
  for (const ep of model.apiEndpoints) {
    result += `  ${ep.method} ${ep.path} → ${ep.description}\n`;
  }

  result += `\n### Pages\n`;
  for (const page of model.suggestedPages) {
    result += `  ${page.path} → ${page.title} (${page.type}${page.entity ? `, entity: ${page.entity}` : ""})\n`;
  }

  result += `\n### Navigation\n`;
  for (const nav of model.suggestedNavItems) {
    result += `  ${nav.label} → ${nav.path} (icon: ${nav.icon})\n`;
  }

  return result;
}

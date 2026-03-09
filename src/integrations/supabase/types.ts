export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      deploy_history: {
        Row: {
          created_at: string
          deployed_by: string
          deployed_by_email: string
          from_env: string
          id: string
          notes: string
          project_id: string
          snapshot_id: string | null
          status: string
          to_env: string
        }
        Insert: {
          created_at?: string
          deployed_by: string
          deployed_by_email?: string
          from_env?: string
          id?: string
          notes?: string
          project_id: string
          snapshot_id?: string | null
          status?: string
          to_env?: string
        }
        Update: {
          created_at?: string
          deployed_by?: string
          deployed_by_email?: string
          from_env?: string
          id?: string
          notes?: string
          project_id?: string
          snapshot_id?: string | null
          status?: string
          to_env?: string
        }
        Relationships: [
          {
            foreignKeyName: "deploy_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      installed_plugins: {
        Row: {
          config: Json
          id: string
          installed_at: string
          plugin_id: string
          project_id: string
        }
        Insert: {
          config?: Json
          id?: string
          installed_at?: string
          plugin_id: string
          project_id: string
        }
        Update: {
          config?: Json
          id?: string
          installed_at?: string
          plugin_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installed_plugins_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "plugins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_plugins_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plugins: {
        Row: {
          author: string
          category: string
          created_at: string
          dependencies: Json
          description: string
          downloads: number
          edge_functions: Json
          files: Json
          icon: string
          id: string
          is_official: boolean
          long_description: string
          name: string
          rating: number
          required_secrets: string[]
          slug: string
          tags: string[]
          updated_at: string
          version: string
        }
        Insert: {
          author?: string
          category?: string
          created_at?: string
          dependencies?: Json
          description?: string
          downloads?: number
          edge_functions?: Json
          files?: Json
          icon?: string
          id?: string
          is_official?: boolean
          long_description?: string
          name: string
          rating?: number
          required_secrets?: string[]
          slug: string
          tags?: string[]
          updated_at?: string
          version?: string
        }
        Update: {
          author?: string
          category?: string
          created_at?: string
          dependencies?: Json
          description?: string
          downloads?: number
          edge_functions?: Json
          files?: Json
          icon?: string
          id?: string
          is_official?: boolean
          long_description?: string
          name?: string
          rating?: number
          required_secrets?: string[]
          slug?: string
          tags?: string[]
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_analytics: {
        Row: {
          country: string | null
          created_at: string
          event: string
          id: string
          path: string
          project_id: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          event?: string
          id?: string
          path?: string
          project_id: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          event?: string
          id?: string
          path?: string
          project_id?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_analytics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_data: {
        Row: {
          collection: string
          created_at: string
          data: Json
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          collection: string
          created_at?: string
          data?: Json
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          collection?: string
          created_at?: string
          data?: Json
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_decisions: {
        Row: {
          category: string
          context: Json
          created_at: string
          description: string
          id: string
          is_active: boolean
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          context?: Json
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          project_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          category?: string
          context?: Json
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_dependencies: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          project_id: string
          relationship: string
          source_name: string
          source_type: string
          target_name: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          project_id: string
          relationship?: string
          source_name?: string
          source_type?: string
          target_name?: string
          target_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string
          relationship?: string
          source_name?: string
          source_type?: string
          target_name?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_email_config: {
        Row: {
          config: Json
          created_at: string
          from_email: string
          from_name: string
          id: string
          project_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          project_id: string
          provider?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          project_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_email_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          project_id: string
          provider: string
          status: string
          subject: string
          template_name: string
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          project_id: string
          provider?: string
          status?: string
          subject?: string
          template_name?: string
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          project_id?: string
          provider?: string
          status?: string
          subject?: string
          template_name?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_email_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_email_templates: {
        Row: {
          created_at: string
          html_body: string
          id: string
          name: string
          project_id: string
          subject: string
          text_body: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          html_body?: string
          id?: string
          name?: string
          project_id: string
          subject?: string
          text_body?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          html_body?: string
          id?: string
          name?: string
          project_id?: string
          subject?: string
          text_body?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_email_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_environments: {
        Row: {
          config: Json
          created_at: string
          deployed_at: string | null
          deployed_by: string | null
          html_snapshot: string
          id: string
          is_locked: boolean
          label: string
          name: string
          preview_url: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          deployed_at?: string | null
          deployed_by?: string | null
          html_snapshot?: string
          id?: string
          is_locked?: boolean
          label?: string
          name?: string
          preview_url?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          deployed_at?: string | null
          deployed_by?: string | null
          html_snapshot?: string
          id?: string
          is_locked?: boolean
          label?: string
          name?: string
          preview_url?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_environments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_functions: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          project_id: string
          trigger_type: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          trigger_type?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_functions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_governance_rules: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          project_id: string
          rule_config: Json
          severity: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id: string
          rule_config?: Json
          severity?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          rule_config?: Json
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_governance_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_knowledge: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_knowledge_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_schemas: {
        Row: {
          collection_name: string
          created_at: string
          id: string
          project_id: string
          schema: Json
        }
        Insert: {
          collection_name: string
          created_at?: string
          id?: string
          project_id: string
          schema?: Json
        }
        Update: {
          collection_name?: string
          created_at?: string
          id?: string
          project_id?: string
          schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_schemas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          metadata: Json
          password_hash: string
          project_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          metadata?: Json
          password_hash: string
          project_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          metadata?: Json
          password_hash?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_users_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          chat_history: Json
          created_at: string
          html_content: string
          id: string
          is_published: boolean
          name: string
          published_slug: string | null
          tech_stack: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_history?: Json
          created_at?: string
          html_content?: string
          id?: string
          is_published?: boolean
          name?: string
          published_slug?: string | null
          tech_stack?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_history?: Json
          created_at?: string
          html_content?: string
          id?: string
          is_published?: boolean
          name?: string
          published_slug?: string | null
          tech_stack?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          user_email: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          project_id: string
          user_email: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          project_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          project_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

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
      build_jobs: {
        Row: {
          artifact_path: string | null
          build_config: Json
          build_duration_ms: number | null
          build_log: string[]
          completed_at: string | null
          created_at: string
          dependencies: Json
          error: string | null
          file_count: number
          id: string
          output_files: Json
          preview_url: string | null
          project_id: string
          source_files: Json
          started_at: string | null
          status: string
          total_size_bytes: number
          user_id: string
          validation_results: Json
        }
        Insert: {
          artifact_path?: string | null
          build_config?: Json
          build_duration_ms?: number | null
          build_log?: string[]
          completed_at?: string | null
          created_at?: string
          dependencies?: Json
          error?: string | null
          file_count?: number
          id?: string
          output_files?: Json
          preview_url?: string | null
          project_id: string
          source_files?: Json
          started_at?: string | null
          status?: string
          total_size_bytes?: number
          user_id: string
          validation_results?: Json
        }
        Update: {
          artifact_path?: string | null
          build_config?: Json
          build_duration_ms?: number | null
          build_log?: string[]
          completed_at?: string | null
          created_at?: string
          dependencies?: Json
          error?: string | null
          file_count?: number
          id?: string
          output_files?: Json
          preview_url?: string | null
          project_id?: string
          source_files?: Json
          started_at?: string | null
          status?: string
          total_size_bytes?: number
          user_id?: string
          validation_results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "build_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_entries: {
        Row: {
          cache_key: string
          cache_type: string
          cache_value: Json
          created_at: string
          expires_at: string
          hit_count: number
          id: string
          project_id: string
          prompt_hash: string | null
          ttl_seconds: number
        }
        Insert: {
          cache_key: string
          cache_type?: string
          cache_value?: Json
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          project_id: string
          prompt_hash?: string | null
          ttl_seconds?: number
        }
        Update: {
          cache_key?: string
          cache_type?: string
          cache_value?: Json
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          project_id?: string
          prompt_hash?: string | null
          ttl_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "cache_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usage: {
        Row: {
          created_at: string
          credits_consumed: number
          id: string
          metadata: Json
          operation: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_consumed?: number
          id?: string
          metadata?: Json
          operation: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          credits_consumed?: number
          id?: string
          metadata?: Json
          operation?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
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
      pd_1690a1e023a3_message: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_attendance: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_billing: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_blood: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_dedicated: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_hospital: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_invoice: {
        Row: {
          amount: number
          client_email: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          client_email: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_email?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_kpi: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_nursing: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_roster: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_1c2d9f6c9a2e_time: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_2677e1ff1304_basic: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_2677e1ff1304_contact: {
        Row: {
          company: string | null
          created_at: string
          description: string | null
          email: string
          id: string
          name: string
          phone: string | null
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          description?: string | null
          email: string
          id?: string
          name: string
          phone?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_2677e1ff1304_conversion: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_2677e1ff1304_crm: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_41de2831d51c_category: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_41de2831d51c_item: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_41de2831d51c_product: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          project_id: string
          sku: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          project_id?: string
          sku?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          project_id?: string
          sku?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_531e8b4b7409_clas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_5f52b4953199_and: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_5f52b4953199_crm: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_5f52b4953199_distinct: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_5f52b4953199_team: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_9b3df1232f0f_contact: {
        Row: {
          company: string | null
          created_at: string
          description: string | null
          email: string
          id: string
          name: string
          phone: string | null
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          description?: string | null
          email: string
          id?: string
          name: string
          phone?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_9b3df1232f0f_crm: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_authentication: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_blank: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_clas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_dynamic: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_implement: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_missing: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_more: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_setting: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_b0de245a069e_state: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_blank: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_course: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_grade: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_missing: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_static: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_these: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_user: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_bac047fee836_workflow: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_fbefa4f4ad88_state: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pd_fbefa4f4ad88_task: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          priority: string | null
          project_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          priority?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          priority?: string | null
          project_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
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
      project_audit_log: {
        Row: {
          action: string
          after_state: Json | null
          agent_name: string
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          project_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          agent_name?: string
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          project_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          agent_name?: string
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_build_readiness: {
        Row: {
          checks: Json
          created_at: string
          id: string
          incomplete_workflows: Json
          is_ready: boolean
          missing_constraints: Json
          missing_fields: Json
          project_id: string
          recommendation: string
          score: number
          underspecified_components: Json
          unresolved_roles: Json
          updated_at: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          id?: string
          incomplete_workflows?: Json
          is_ready?: boolean
          missing_constraints?: Json
          missing_fields?: Json
          project_id: string
          recommendation?: string
          score?: number
          underspecified_components?: Json
          unresolved_roles?: Json
          updated_at?: string
        }
        Update: {
          checks?: Json
          created_at?: string
          id?: string
          incomplete_workflows?: Json
          is_ready?: boolean
          missing_constraints?: Json
          missing_fields?: Json
          project_id?: string
          recommendation?: string
          score?: number
          underspecified_components?: Json
          unresolved_roles?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_build_readiness_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_context: {
        Row: {
          context_key: string
          context_type: string
          context_value: Json
          created_at: string
          expires_at: string | null
          id: string
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          context_key?: string
          context_type?: string
          context_value?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          context_key?: string
          context_type?: string
          context_value?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_context_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_conversation_state: {
        Row: {
          agent_states: Json
          created_at: string
          id: string
          metadata: Json
          mode: string
          phases: Json
          project_id: string
          updated_at: string
          version: number
        }
        Insert: {
          agent_states?: Json
          created_at?: string
          id?: string
          metadata?: Json
          mode?: string
          phases?: Json
          project_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          agent_states?: Json
          created_at?: string
          id?: string
          metadata?: Json
          mode?: string
          phases?: Json
          project_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_conversation_state_project_id_fkey"
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
      project_migrations: {
        Row: {
          applied_at: string
          created_at: string
          id: string
          name: string
          project_id: string
          sql_down: string
          sql_up: string
          status: string
          version: number
        }
        Insert: {
          applied_at?: string
          created_at?: string
          id?: string
          name?: string
          project_id: string
          sql_down?: string
          sql_up?: string
          status?: string
          version?: number
        }
        Update: {
          applied_at?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          sql_down?: string
          sql_up?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_migrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_requirements: {
        Row: {
          created_at: string
          has_images: boolean
          id: string
          ir_mappings: Json
          normalized: Json
          parsed: Json
          phase_number: number
          project_id: string
          raw_text: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          has_images?: boolean
          id?: string
          ir_mappings?: Json
          normalized?: Json
          parsed?: Json
          phase_number?: number
          project_id: string
          raw_text?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          has_images?: boolean
          id?: string
          ir_mappings?: Json
          normalized?: Json
          parsed?: Json
          phase_number?: number
          project_id?: string
          raw_text?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_requirements_project_id_fkey"
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
      project_tables: {
        Row: {
          columns: Json
          created_at: string
          full_table_name: string
          has_rls: boolean
          id: string
          project_id: string
          table_name: string
          updated_at: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          full_table_name: string
          has_rls?: boolean
          id?: string
          project_id: string
          table_name: string
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          full_table_name?: string
          has_rls?: boolean
          id?: string
          project_id?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tables_project_id_fkey"
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
          ir_state: Json
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
          ir_state?: Json
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
          ir_state?: Json
          is_published?: boolean
          name?: string
          published_slug?: string | null
          tech_stack?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_tiers: {
        Row: {
          created_at: string
          credits_per_month: number
          features: Json
          id: string
          is_active: boolean
          max_custom_domains: number
          max_projects: number
          max_team_members: number
          name: string
          price_monthly: number
        }
        Insert: {
          created_at?: string
          credits_per_month?: number
          features?: Json
          id: string
          is_active?: boolean
          max_custom_domains?: number
          max_projects?: number
          max_team_members?: number
          name: string
          price_monthly?: number
        }
        Update: {
          created_at?: string
          credits_per_month?: number
          features?: Json
          id?: string
          is_active?: boolean
          max_custom_domains?: number
          max_projects?: number
          max_team_members?: number
          name?: string
          price_monthly?: number
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
      user_subscriptions: {
        Row: {
          created_at: string
          credits_remaining: number
          credits_used: number
          current_period_end: string
          current_period_start: string
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_remaining?: number
          credits_used?: number
          current_period_end?: string
          current_period_start?: string
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          credits_used?: number
          current_period_end?: string
          current_period_start?: string
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
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
      cleanup_expired_cache: { Args: never; Returns: number }
      exec_ddl: { Args: { ddl_sql: string }; Returns: undefined }
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

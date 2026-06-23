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
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_types: {
        Row: {
          category: string | null
          created_at: string
          id: string
          label: string
          slug: string
          system_managed: boolean
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          label: string
          slug: string
          system_managed?: boolean
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          label?: string
          slug?: string
          system_managed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ai_intake_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decision: string | null
          email: string | null
          goal: string
          id: string
          ip_address: unknown
          pain_points: string | null
          referer: string | null
          status: string
          tools: string | null
          user_agent: string | null
          workflow_description: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          email?: string | null
          goal: string
          id?: string
          ip_address?: unknown
          pain_points?: string | null
          referer?: string | null
          status?: string
          tools?: string | null
          user_agent?: string | null
          workflow_description: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          email?: string | null
          goal?: string
          id?: string
          ip_address?: unknown
          pain_points?: string | null
          referer?: string | null
          status?: string
          tools?: string | null
          user_agent?: string | null
          workflow_description?: string
        }
        Relationships: []
      }
      ai_workflow_blueprints: {
        Row: {
          blueprint_json: Json | null
          blueprint_markdown: string
          created_at: string
          estimated_time_saved_minutes: number | null
          id: string
          intake_id: string
          opportunities: string | null
          risks: string | null
          suggested_tools: string | null
          summary: string
        }
        Insert: {
          blueprint_json?: Json | null
          blueprint_markdown: string
          created_at?: string
          estimated_time_saved_minutes?: number | null
          id?: string
          intake_id: string
          opportunities?: string | null
          risks?: string | null
          suggested_tools?: string | null
          summary: string
        }
        Update: {
          blueprint_json?: Json | null
          blueprint_markdown?: string
          created_at?: string
          estimated_time_saved_minutes?: number | null
          id?: string
          intake_id?: string
          opportunities?: string | null
          risks?: string | null
          suggested_tools?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workflow_blueprints_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "ai_intake_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          name: string
          primary_contact_name: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id?: string
          name: string
          primary_contact_name?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          primary_contact_name?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cockpit_journey_outcomes: {
        Row: {
          action_taken: string | null
          actor: string | null
          created_at: string | null
          id: string
          journey_key: string
          object_id: string
          object_type: string
          outcome_status: string
          payload: Json | null
          reason: string | null
        }
        Insert: {
          action_taken?: string | null
          actor?: string | null
          created_at?: string | null
          id?: string
          journey_key: string
          object_id: string
          object_type: string
          outcome_status: string
          payload?: Json | null
          reason?: string | null
        }
        Update: {
          action_taken?: string | null
          actor?: string | null
          created_at?: string | null
          id?: string
          journey_key?: string
          object_id?: string
          object_type?: string
          outcome_status?: string
          payload?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_journey_outcomes_journey_key_fkey"
            columns: ["journey_key"]
            isOneToOne: false
            referencedRelation: "cockpit_journey_summary"
            referencedColumns: ["journey_key"]
          },
          {
            foreignKeyName: "cockpit_journey_outcomes_journey_key_fkey"
            columns: ["journey_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_journeys"
            referencedColumns: ["journey_key"]
          },
        ]
      }
      cockpit_operator_journey_steps: {
        Row: {
          display_order: number
          fallback_action: string | null
          instruction: string
          journey_key: string
          object_type: string | null
          recommended_action: string | null
          step_key: string
          success_hint: string | null
          title: string
        }
        Insert: {
          display_order: number
          fallback_action?: string | null
          instruction: string
          journey_key: string
          object_type?: string | null
          recommended_action?: string | null
          step_key: string
          success_hint?: string | null
          title: string
        }
        Update: {
          display_order?: number
          fallback_action?: string | null
          instruction?: string
          journey_key?: string
          object_type?: string | null
          recommended_action?: string | null
          step_key?: string
          success_hint?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_operator_journey_steps_journey_key_fkey"
            columns: ["journey_key"]
            isOneToOne: false
            referencedRelation: "cockpit_journey_summary"
            referencedColumns: ["journey_key"]
          },
          {
            foreignKeyName: "cockpit_operator_journey_steps_journey_key_fkey"
            columns: ["journey_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_journeys"
            referencedColumns: ["journey_key"]
          },
        ]
      }
      cockpit_operator_journeys: {
        Row: {
          created_at: string | null
          default_priority: number | null
          description: string | null
          enabled: boolean | null
          entry_condition: string | null
          journey_key: string
          mode_key: string | null
          success_condition: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_priority?: number | null
          description?: string | null
          enabled?: boolean | null
          entry_condition?: string | null
          journey_key: string
          mode_key?: string | null
          success_condition?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_priority?: number | null
          description?: string | null
          enabled?: boolean | null
          entry_condition?: string | null
          journey_key?: string
          mode_key?: string | null
          success_condition?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_operator_journeys_mode_key_fkey"
            columns: ["mode_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_mode_summary"
            referencedColumns: ["mode_key"]
          },
          {
            foreignKeyName: "cockpit_operator_journeys_mode_key_fkey"
            columns: ["mode_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_modes"
            referencedColumns: ["mode_key"]
          },
        ]
      }
      cockpit_operator_mode_workflows: {
        Row: {
          display_order: number | null
          mode_key: string
          workflow_key: string
        }
        Insert: {
          display_order?: number | null
          mode_key: string
          workflow_key: string
        }
        Update: {
          display_order?: number | null
          mode_key?: string
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_operator_mode_workflows_mode_key_fkey"
            columns: ["mode_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_mode_summary"
            referencedColumns: ["mode_key"]
          },
          {
            foreignKeyName: "cockpit_operator_mode_workflows_mode_key_fkey"
            columns: ["mode_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_modes"
            referencedColumns: ["mode_key"]
          },
          {
            foreignKeyName: "cockpit_operator_mode_workflows_workflow_key_fkey"
            columns: ["workflow_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_workflows"
            referencedColumns: ["workflow_key"]
          },
          {
            foreignKeyName: "cockpit_operator_mode_workflows_workflow_key_fkey"
            columns: ["workflow_key"]
            isOneToOne: false
            referencedRelation: "cockpit_workflow_summary"
            referencedColumns: ["workflow_key"]
          },
        ]
      }
      cockpit_operator_modes: {
        Row: {
          category: string
          created_at: string | null
          default_order: number | null
          description: string | null
          enabled: boolean | null
          mode_key: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          default_order?: number | null
          description?: string | null
          enabled?: boolean | null
          mode_key: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          default_order?: number | null
          description?: string | null
          enabled?: boolean | null
          mode_key?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cockpit_operator_workflows: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          enabled: boolean | null
          priority: number | null
          recommended_actions: string[] | null
          title: string
          trigger_view: string | null
          updated_at: string | null
          workflow_key: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          priority?: number | null
          recommended_actions?: string[] | null
          title: string
          trigger_view?: string | null
          updated_at?: string | null
          workflow_key: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          priority?: number | null
          recommended_actions?: string[] | null
          title?: string
          trigger_view?: string | null
          updated_at?: string | null
          workflow_key?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          business_name: string | null
          created_at: string
          email: string | null
          enquiry_type: string | null
          first_seen_at: string
          full_name: string | null
          id: string
          last_seen_at: string
          lead_status: string
          lifecycle_stage: string
          linkedin_url: string | null
          message: string | null
          metadata: Json
          notes: string | null
          owner: string | null
          phone: string | null
          relationship_types: string[]
          source_record_id: string | null
          source_system: string
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email?: string | null
          enquiry_type?: string | null
          first_seen_at?: string
          full_name?: string | null
          id?: string
          last_seen_at?: string
          lead_status?: string
          lifecycle_stage?: string
          linkedin_url?: string | null
          message?: string | null
          metadata?: Json
          notes?: string | null
          owner?: string | null
          phone?: string | null
          relationship_types?: string[]
          source_record_id?: string | null
          source_system: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string | null
          enquiry_type?: string | null
          first_seen_at?: string
          full_name?: string | null
          id?: string
          last_seen_at?: string
          lead_status?: string
          lifecycle_stage?: string
          linkedin_url?: string | null
          message?: string | null
          metadata?: Json
          notes?: string | null
          owner?: string | null
          phone?: string | null
          relationship_types?: string[]
          source_record_id?: string | null
          source_system?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      content_asset_templates: {
        Row: {
          active: boolean
          asset_type: string
          channel: string | null
          created_at: string
          format: string | null
          id: string
          metadata: Json
          output_type: string
          priority: number
          required_metadata_keys: Json
          template_config: Json
          template_key: string
          template_version: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          asset_type?: string
          channel?: string | null
          created_at?: string
          format?: string | null
          id?: string
          metadata?: Json
          output_type: string
          priority?: number
          required_metadata_keys?: Json
          template_config?: Json
          template_key: string
          template_version?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          asset_type?: string
          channel?: string | null
          created_at?: string
          format?: string | null
          id?: string
          metadata?: Json
          output_type?: string
          priority?: number
          required_metadata_keys?: Json
          template_config?: Json
          template_key?: string
          template_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      content_assets: {
        Row: {
          approval_required: boolean
          asset_type: string
          assigned_agent: string | null
          assigned_role: string | null
          autonomous_allowed: boolean
          body: string | null
          created_at: string
          derived_from_event_id: string | null
          editorial_score: number | null
          generation_reason: string
          human_required: boolean
          id: string
          insight_id: string | null
          lineage_depth: number
          metadata: Json
          output_type: string | null
          parent_asset_id: string | null
          publish_blocked: boolean
          review_notes: Json
          review_state: string
          source_id: string | null
          status: string
          title: string | null
          updated_at: string
          voice_alignment: string | null
          workflow_stage: string | null
        }
        Insert: {
          approval_required?: boolean
          asset_type: string
          assigned_agent?: string | null
          assigned_role?: string | null
          autonomous_allowed?: boolean
          body?: string | null
          created_at?: string
          derived_from_event_id?: string | null
          editorial_score?: number | null
          generation_reason?: string
          human_required?: boolean
          id?: string
          insight_id?: string | null
          lineage_depth?: number
          metadata?: Json
          output_type?: string | null
          parent_asset_id?: string | null
          publish_blocked?: boolean
          review_notes?: Json
          review_state?: string
          source_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          voice_alignment?: string | null
          workflow_stage?: string | null
        }
        Update: {
          approval_required?: boolean
          asset_type?: string
          assigned_agent?: string | null
          assigned_role?: string | null
          autonomous_allowed?: boolean
          body?: string | null
          created_at?: string
          derived_from_event_id?: string | null
          editorial_score?: number | null
          generation_reason?: string
          human_required?: boolean
          id?: string
          insight_id?: string | null
          lineage_depth?: number
          metadata?: Json
          output_type?: string | null
          parent_asset_id?: string | null
          publish_blocked?: boolean
          review_notes?: Json
          review_state?: string
          source_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          voice_alignment?: string | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_assets_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_assets_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_assets_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "content_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      content_insights: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          insight_key: string | null
          interpretation: Json
          metadata: Json
          source_id: string | null
          status: string
          summary: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          insight_key?: string | null
          interpretation?: Json
          metadata?: Json
          source_id?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          insight_key?: string | null
          interpretation?: Json
          metadata?: Json
          source_id?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_insights_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          canonical_body: string | null
          channel_payloads: Json | null
          created_at: string
          excerpt: string | null
          hero_image_url: string | null
          id: string
          metadata: Json
          notion_last_edited_at: string | null
          platform_targets: Json
          publish_date: string | null
          slug: string | null
          source_record_id: string
          source_system: string
          status: string
          sync_hash: string | null
          tags: Json
          title: string
          updated_at: string
          wordpress_post_id: string | null
          wordpress_url: string | null
        }
        Insert: {
          canonical_body?: string | null
          channel_payloads?: Json | null
          created_at?: string
          excerpt?: string | null
          hero_image_url?: string | null
          id?: string
          metadata?: Json
          notion_last_edited_at?: string | null
          platform_targets?: Json
          publish_date?: string | null
          slug?: string | null
          source_record_id: string
          source_system?: string
          status?: string
          sync_hash?: string | null
          tags?: Json
          title: string
          updated_at?: string
          wordpress_post_id?: string | null
          wordpress_url?: string | null
        }
        Update: {
          canonical_body?: string | null
          channel_payloads?: Json | null
          created_at?: string
          excerpt?: string | null
          hero_image_url?: string | null
          id?: string
          metadata?: Json
          notion_last_edited_at?: string | null
          platform_targets?: Json
          publish_date?: string | null
          slug?: string | null
          source_record_id?: string
          source_system?: string
          status?: string
          sync_hash?: string | null
          tags?: Json
          title?: string
          updated_at?: string
          wordpress_post_id?: string | null
          wordpress_url?: string | null
        }
        Relationships: []
      }
      content_outputs: {
        Row: {
          approval_required: boolean
          autonomous_allowed: boolean
          body: string | null
          created_at: string | null
          created_by_agent: string
          derived_from_event_id: string | null
          generation_reason: string | null
          human_required: boolean
          id: string
          lineage_depth: number
          output_type: string
          package_id: string
          parent_asset_id: string | null
          parent_output_id: string | null
          publish_blocked: boolean
          review_notes: Json | null
          review_state: string
          status: string
          updated_at: string | null
          workflow_stage: string | null
        }
        Insert: {
          approval_required?: boolean
          autonomous_allowed?: boolean
          body?: string | null
          created_at?: string | null
          created_by_agent: string
          derived_from_event_id?: string | null
          generation_reason?: string | null
          human_required?: boolean
          id?: string
          lineage_depth?: number
          output_type: string
          package_id: string
          parent_asset_id?: string | null
          parent_output_id?: string | null
          publish_blocked?: boolean
          review_notes?: Json | null
          review_state?: string
          status: string
          updated_at?: string | null
          workflow_stage?: string | null
        }
        Update: {
          approval_required?: boolean
          autonomous_allowed?: boolean
          body?: string | null
          created_at?: string | null
          created_by_agent?: string
          derived_from_event_id?: string | null
          generation_reason?: string | null
          human_required?: boolean
          id?: string
          lineage_depth?: number
          output_type?: string
          package_id?: string
          parent_asset_id?: string | null
          parent_output_id?: string | null
          publish_blocked?: boolean
          review_notes?: Json | null
          review_state?: string
          status?: string
          updated_at?: string | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_outputs_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_outputs_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_outputs_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_derived_from_event_id_fkey"
            columns: ["derived_from_event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_outputs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "content_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_parent_output_id_fkey"
            columns: ["parent_output_id"]
            isOneToOne: false
            referencedRelation: "content_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_parent_output_id_fkey"
            columns: ["parent_output_id"]
            isOneToOne: false
            referencedRelation: "content_review_queue_view"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packages: {
        Row: {
          body_markdown: string
          content_type: string
          created_at: string | null
          id: string
          requested_outputs: Json
          review_notes: Json | null
          review_required: boolean | null
          source_id: string
          source_system: string
          source_type: string
          status: string
          submitted_at: string
          submitted_by: string
          summary: string | null
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body_markdown: string
          content_type: string
          created_at?: string | null
          id?: string
          requested_outputs?: Json
          review_notes?: Json | null
          review_required?: boolean | null
          source_id: string
          source_system: string
          source_type: string
          status: string
          submitted_at: string
          submitted_by: string
          summary?: string | null
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body_markdown?: string
          content_type?: string
          created_at?: string | null
          id?: string
          requested_outputs?: Json
          review_notes?: Json | null
          review_required?: boolean | null
          source_id?: string
          source_system?: string
          source_type?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          summary?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      content_sources: {
        Row: {
          body_markdown: string | null
          created_at: string
          id: string
          metadata: Json
          source_id: string | null
          source_system: string
          source_type: string
          status: string
          summary: string | null
          tags: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          body_markdown?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          source_id?: string | null
          source_system?: string
          source_type?: string
          status?: string
          summary?: string | null
          tags?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          body_markdown?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          source_id?: string | null
          source_system?: string
          source_type?: string
          status?: string
          summary?: string | null
          tags?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      content_work_queue: {
        Row: {
          approval_required: boolean
          assigned_agent: string | null
          assigned_role: string | null
          autonomous_allowed: boolean
          blocked_reason: string | null
          breached_at: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          entity_id: string
          entity_type: string
          human_required: boolean
          id: string
          metadata: Json
          priority: number
          publish_blocked: boolean
          queue_type: string
          queued_at: string
          source_event_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          assigned_agent?: string | null
          assigned_role?: string | null
          autonomous_allowed?: boolean
          blocked_reason?: string | null
          breached_at?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          entity_id: string
          entity_type: string
          human_required?: boolean
          id?: string
          metadata?: Json
          priority?: number
          publish_blocked?: boolean
          queue_type: string
          queued_at?: string
          source_event_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          assigned_agent?: string | null
          assigned_role?: string | null
          autonomous_allowed?: boolean
          blocked_reason?: string | null
          breached_at?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          entity_id?: string
          entity_type?: string
          human_required?: boolean
          id?: string
          metadata?: Json
          priority?: number
          publish_blocked?: boolean
          queue_type?: string
          queued_at?: string
          source_event_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_work_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_work_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_work_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "content_work_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_work_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
        ]
      }
      creator_assessment_template_questions: {
        Row: {
          created_at: string
          is_included: boolean
          question_id: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_included?: boolean
          question_id: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_included?: boolean
          question_id?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_assessment_template_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "creator_question_bank"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_assessment_template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "creator_assessment_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_assessment_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_assessments: {
        Row: {
          agency_opportunity_score: number | null
          assessment_snapshot: Json | null
          brand_clarity_score: number | null
          business_acumen: number | null
          coachability: number | null
          consistency_score: number | null
          created_at: string
          creator_dna_score: number | null
          creator_profile_id: string
          id: string
          monetisation_score: number | null
          responses: Json
        }
        Insert: {
          agency_opportunity_score?: number | null
          assessment_snapshot?: Json | null
          brand_clarity_score?: number | null
          consistency_score?: number | null
          created_at?: string
          creator_dna_score?: number | null
          creator_profile_id: string
          id?: string
          monetisation_score?: number | null
          responses: Json
        }
        Update: {
          agency_opportunity_score?: number | null
          assessment_snapshot?: Json | null
          brand_clarity_score?: number | null
          consistency_score?: number | null
          created_at?: string
          creator_dna_score?: number | null
          creator_profile_id?: string
          id?: string
          monetisation_score?: number | null
          responses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "creator_assessments_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_dna_profiles: {
        Row: {
          agency_opportunity_band: string
          agency_opportunity_score: number
          archetype_confidence: number
          assessment_id: string
          authenticity_band: string
          authenticity_flags: Json
          confidence: number
          created_at: string
          creator_dna_primary: string
          creator_dna_secondary: string
          creator_profile_id: string
          fantasy_archetype: string
          growth_constraints: Json
          id: string
          monetisation_readiness: string
          summary: string
        }
        Insert: {
          agency_opportunity_band: string
          agency_opportunity_score: number
          archetype_confidence: number
          assessment_id: string
          authenticity_band: string
          authenticity_flags?: Json
          confidence: number
          created_at?: string
          creator_dna_primary: string
          creator_dna_secondary: string
          creator_profile_id: string
          fantasy_archetype: string
          growth_constraints?: Json
          id?: string
          monetisation_readiness: string
          summary: string
        }
        Update: {
          agency_opportunity_band?: string
          agency_opportunity_score?: number
          archetype_confidence?: number
          assessment_id?: string
          authenticity_band?: string
          authenticity_flags?: Json
          confidence?: number
          created_at?: string
          creator_dna_primary?: string
          creator_dna_secondary?: string
          creator_profile_id?: string
          fantasy_archetype?: string
          growth_constraints?: Json
          id?: string
          monetisation_readiness?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_dna_profiles_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "creator_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_dna_profiles_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_notes: {
        Row: {
          created_at: string
          creator_profile_id: string
          id: string
          note: string
        }
        Insert: {
          created_at?: string
          creator_profile_id: string
          id?: string
          note: string
        }
        Update: {
          created_at?: string
          creator_profile_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_notes_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          agency_opportunity_score: number | null
          archetype: string | null
          audience_strategy: string | null
          brand_clarity_score: number | null
          consistency_score: number | null
          country: string | null
          created_at: string
          creator_dna_score: number | null
          creator_stage: string
          email: string | null
          city: string | null
          consent_at: string | null
          consent_to_contact: boolean
          first_name: string | null
          full_name: string
          id: string
          latest_assessment_id: string | null
          latest_report_id: string | null
          last_name: string | null
          mailing_list_opt_out: boolean
          management_readiness: string | null
          management_wraparound_potential: string | null
          model_name: string | null
          monetisation_score: number | null
          notes: string | null
          ofmanager_creator_id: string | null
          onlyfans_handle: string | null
          recommended_pricing_model: string | null
          service_qualification: Json
          status: string
          top_vertical_1: string | null
          top_vertical_2: string | null
          top_vertical_3: string | null
          updated_at: string
        }
        Insert: {
          agency_opportunity_score?: number | null
          archetype?: string | null
          audience_strategy?: string | null
          brand_clarity_score?: number | null
          business_acumen?: number | null
          coachability?: number | null
          consistency_score?: number | null
          country?: string | null
          created_at?: string
          creator_dna_score?: number | null
          creator_stage?: string
          email?: string | null
          city?: string | null
          consent_at?: string | null
          consent_to_contact?: boolean
          first_name?: string | null
          full_name: string
          id?: string
          latest_assessment_id?: string | null
          latest_report_id?: string | null
          last_name?: string | null
          mailing_list_opt_out?: boolean
          management_readiness?: string | null
          management_wraparound_potential?: string | null
          model_name?: string | null
          monetisation_score?: number | null
          notes?: string | null
          ofmanager_creator_id?: string | null
          onlyfans_handle?: string | null
          recommended_pricing_model?: string | null
          service_qualification?: Json
          status?: string
          top_vertical_1?: string | null
          top_vertical_2?: string | null
          top_vertical_3?: string | null
          updated_at?: string
        }
        Update: {
          agency_opportunity_score?: number | null
          archetype?: string | null
          audience_strategy?: string | null
          brand_clarity_score?: number | null
          business_acumen?: number | null
          coachability?: number | null
          consistency_score?: number | null
          country?: string | null
          created_at?: string
          creator_dna_score?: number | null
          creator_stage?: string
          email?: string | null
          city?: string | null
          consent_at?: string | null
          consent_to_contact?: boolean
          first_name?: string | null
          full_name?: string
          id?: string
          latest_assessment_id?: string | null
          latest_report_id?: string | null
          last_name?: string | null
          mailing_list_opt_out?: boolean
          management_readiness?: string | null
          management_wraparound_potential?: string | null
          model_name?: string | null
          monetisation_score?: number | null
          notes?: string | null
          ofmanager_creator_id?: string | null
          onlyfans_handle?: string | null
          recommended_pricing_model?: string | null
          service_qualification?: Json
          status?: string
          top_vertical_1?: string | null
          top_vertical_2?: string | null
          top_vertical_3?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creator_question_bank: {
        Row: {
          config: Json
          created_at: string
          help_text: string | null
          id: string
          is_active: boolean
          options: Json
          parent_question_key: string | null
          question_key: string
          question_text: string
          question_type: string
          response_key: string
          scoring_dimension: string | null
          section: string
          show_when_operator: string
          show_when_value: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          options?: Json
          parent_question_key?: string | null
          question_key: string
          question_text: string
          question_type: string
          response_key: string
          scoring_dimension?: string | null
          section: string
          show_when_operator?: string
          show_when_value?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          options?: Json
          parent_question_key?: string | null
          question_key?: string
          question_text?: string
          question_type?: string
          response_key?: string
          scoring_dimension?: string | null
          section?: string
          show_when_operator?: string
          show_when_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creator_reports: {
        Row: {
          created_at: string
          creator_profile_id: string
          id: string
          report_json: Json
          report_slug: string
          version: string
        }
        Insert: {
          created_at?: string
          creator_profile_id: string
          id?: string
          report_json: Json
          report_slug: string
          version?: string
        }
        Update: {
          created_at?: string
          creator_profile_id?: string
          id?: string
          report_json?: Json
          report_slug?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_reports_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_status_events: {
        Row: {
          created_at: string
          creator_profile_id: string
          details: Json | null
          event_type: string
          id: string
        }
        Insert: {
          created_at?: string
          creator_profile_id: string
          details?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          created_at?: string
          creator_profile_id?: string
          details?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_status_events_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_inquiries: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string
          name: string | null
          page_url: string | null
          payload: Json
          phone: string | null
          source_site: string
          source_system: string
          status: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name?: string | null
          page_url?: string | null
          payload?: Json
          phone?: string | null
          source_site?: string
          source_system?: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string | null
          page_url?: string | null
          payload?: Json
          phone?: string | null
          source_site?: string
          source_system?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      dotcomseekr_domain_results: {
        Row: {
          affiliate_url: string | null
          available: boolean
          created_at: string
          currency: string
          domain: string
          id: string
          metadata: Json
          price: number | null
          provider: string
          search_id: string | null
        }
        Insert: {
          affiliate_url?: string | null
          available: boolean
          created_at?: string
          currency?: string
          domain: string
          id?: string
          metadata?: Json
          price?: number | null
          provider?: string
          search_id?: string | null
        }
        Update: {
          affiliate_url?: string | null
          available?: boolean
          created_at?: string
          currency?: string
          domain?: string
          id?: string
          metadata?: Json
          price?: number | null
          provider?: string
          search_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dotcomseekr_domain_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "dotcomseekr_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      dotcomseekr_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dotcomseekr_searches: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          project_id: string | null
          provider: string
          query: string
          status: string
          tlds: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          provider?: string
          query: string
          status?: string
          tlds?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          provider?: string
          query?: string
          status?: string
          tlds?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dotcomseekr_searches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "dotcomseekr_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_tags: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_ref: string | null
          entity_type: string
          id: string
          source: string
          tag_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_ref?: string | null
          entity_type: string
          id?: string
          source?: string
          tag_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_ref?: string | null
          entity_type?: string
          id?: string
          source?: string
          tag_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_tags_view"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      event_route_executions: {
        Row: {
          actor: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_id: string | null
          id: string
          payload: Json
          queued_item_id: string | null
          route_id: string | null
          status: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          payload?: Json
          queued_item_id?: string | null
          route_id?: string | null
          status?: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          payload?: Json
          queued_item_id?: string | null
          route_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_route_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_route_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_route_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_route_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_route_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_route_executions_queued_item_id_fkey"
            columns: ["queued_item_id"]
            isOneToOne: false
            referencedRelation: "cockpit_route_queue"
            referencedColumns: ["queue_id"]
          },
          {
            foreignKeyName: "event_route_executions_queued_item_id_fkey"
            columns: ["queued_item_id"]
            isOneToOne: false
            referencedRelation: "paperclip_execution_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_route_executions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "event_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_routes: {
        Row: {
          canonical_event_type: string
          created_at: string
          enabled: boolean
          id: string
          notes: string | null
          priority: number
          route_key: string
          target_action: string
          target_layer: string
          target_owner: string | null
          updated_at: string
        }
        Insert: {
          canonical_event_type: string
          created_at?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          priority?: number
          route_key: string
          target_action: string
          target_layer: string
          target_owner?: string | null
          updated_at?: string
        }
        Update: {
          canonical_event_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          priority?: number
          route_key?: string
          target_action?: string
          target_layer?: string
          target_owner?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_taxonomy: {
        Row: {
          canonical_event_type: string
          category: string
          created_at: string | null
          default_priority: number | null
          default_risk_assertions: string[] | null
          default_risk_category: string | null
          description: string | null
          enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          canonical_event_type: string
          category: string
          created_at?: string | null
          default_priority?: number | null
          default_risk_assertions?: string[] | null
          default_risk_category?: string | null
          description?: string | null
          enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          canonical_event_type?: string
          category?: string
          created_at?: string | null
          default_priority?: number | null
          default_risk_assertions?: string[] | null
          default_risk_category?: string | null
          description?: string | null
          enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      event_type_aliases: {
        Row: {
          canonical_event_type: string
          created_at: string | null
          enabled: boolean | null
          raw_event_type: string
          source_system: string | null
        }
        Insert: {
          canonical_event_type: string
          created_at?: string | null
          enabled?: boolean | null
          raw_event_type: string
          source_system?: string | null
        }
        Update: {
          canonical_event_type?: string
          created_at?: string | null
          enabled?: boolean | null
          raw_event_type?: string
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_type_aliases_canonical_event_type_fkey"
            columns: ["canonical_event_type"]
            isOneToOne: false
            referencedRelation: "event_taxonomy"
            referencedColumns: ["canonical_event_type"]
          },
        ]
      }
      events: {
        Row: {
          actor: string | null
          canonical_event_type: string | null
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          entity_id: string | null
          entity_ref: string | null
          entity_type: string
          event_taxonomy_version: string | null
          event_type: string
          id: string
          payload: Json
          risk_assertions: string[] | null
          risk_category: string | null
          risk_version: string | null
          run_id: string | null
          source_system: string
          status: string | null
        }
        Insert: {
          actor?: string | null
          canonical_event_type?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_ref?: string | null
          entity_type: string
          event_taxonomy_version?: string | null
          event_type: string
          id?: string
          payload?: Json
          risk_assertions?: string[] | null
          risk_category?: string | null
          risk_version?: string | null
          run_id?: string | null
          source_system: string
          status?: string | null
        }
        Update: {
          actor?: string | null
          canonical_event_type?: string | null
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_ref?: string | null
          entity_type?: string
          event_taxonomy_version?: string | null
          event_type?: string
          id?: string
          payload?: Json
          risk_assertions?: string[] | null
          risk_category?: string | null
          risk_version?: string | null
          run_id?: string | null
          source_system?: string
          status?: string | null
        }
        Relationships: []
      }
      inbound_contacts: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          payload: Json | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          payload?: Json | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          payload?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      issue_tasks: {
        Row: {
          created_at: string
          issue_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          issue_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          issue_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_tasks_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          consequence: number | null
          created_at: string
          id: string
          issue_key: string | null
          likelihood: number | null
          owner: string | null
          payload: Json
          risk_category: string | null
          risk_rating: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          consequence?: number | null
          created_at?: string
          id?: string
          issue_key?: string | null
          likelihood?: number | null
          owner?: string | null
          payload?: Json
          risk_category?: string | null
          risk_rating?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          consequence?: number | null
          created_at?: string
          id?: string
          issue_key?: string | null
          likelihood?: number | null
          owner?: string | null
          payload?: Json
          risk_category?: string | null
          risk_rating?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          activity_type_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string
          metadata: Json
          occurred_at: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_type_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          occurred_at?: string
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_type_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          created_at: string
          decision_maker: boolean
          email: string | null
          full_name: string | null
          id: string
          lead_id: string
          linkedin_url: string | null
          metadata: Json
          notes: string | null
          phone: string | null
          primary_contact: boolean
          role_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_maker?: boolean
          email?: string | null
          full_name?: string | null
          id?: string
          lead_id: string
          linkedin_url?: string | null
          metadata?: Json
          notes?: string | null
          phone?: string | null
          primary_contact?: boolean
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_maker?: boolean
          email?: string | null
          full_name?: string | null
          id?: string
          lead_id?: string
          linkedin_url?: string | null
          metadata?: Json
          notes?: string | null
          phone?: string | null
          primary_contact?: boolean
          role_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_outreach: {
        Row: {
          body: string | null
          channel: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          external_message_id: string | null
          id: string
          lead_id: string
          metadata: Json
          replied_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          external_message_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          external_message_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          replied_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_outreach_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_outreach_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_outreach_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string
          metadata: Json
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string | null
          id: string
          inquiry_id: string
          owner_role: string
          source: string
          status: string
          ticket_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inquiry_id: string
          owner_role?: string
          source: string
          status?: string
          ticket_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inquiry_id?: string
          owner_role?: string
          source?: string
          status?: string
          ticket_id?: string | null
        }
        Relationships: []
      }
      local_business_audit_reports: {
        Row: {
          assessment_id: string
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          lead_id: string
          metadata_json: Json
          pdf_url: string | null
          report_version: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          lead_id: string
          metadata_json?: Json
          pdf_url?: string | null
          report_version: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          lead_id?: string
          metadata_json?: Json
          pdf_url?: string | null
          report_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_business_audit_reports_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_business_audit_reports_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["assessment_id"]
          },
          {
            foreignKeyName: "local_business_audit_reports_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "local_business_audit_reports_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      local_business_lead_assessments: {
        Row: {
          ai_readiness_score: number
          assessed_at: string
          assessed_by: string | null
          assessment_summary: string | null
          conversion_maturity_score: number
          created_at: string
          demand_signal_score: number
          id: string
          lead_id: string
          opportunity_score: number | null
          recommended_outreach_angle: string | null
          trust_leakage_score: number
        }
        Insert: {
          ai_readiness_score?: number
          assessed_at?: string
          assessed_by?: string | null
          assessment_summary?: string | null
          conversion_maturity_score?: number
          created_at?: string
          demand_signal_score?: number
          id?: string
          lead_id: string
          opportunity_score?: number | null
          recommended_outreach_angle?: string | null
          trust_leakage_score?: number
        }
        Update: {
          ai_readiness_score?: number
          assessed_at?: string
          assessed_by?: string | null
          assessment_summary?: string | null
          conversion_maturity_score?: number
          created_at?: string
          demand_signal_score?: number
          id?: string
          lead_id?: string
          opportunity_score?: number | null
          recommended_outreach_angle?: string | null
          trust_leakage_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "local_business_lead_assessments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "local_business_lead_assessments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      local_business_lead_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          payload: Json
          status: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          payload?: Json
          status?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_business_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "local_business_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      local_business_lead_signals: {
        Row: {
          confidence: number | null
          created_at: string
          evidence_url: string | null
          id: string
          lead_id: string
          notes: string | null
          signal_type: string
          signal_value: string | null
          source: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          signal_type: string
          signal_value?: string | null
          source?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          signal_type?: string
          signal_value?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_business_lead_signals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "local_business_lead_signals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      local_business_leads: {
        Row: {
          address: string | null
          business_name: string
          categories: Json
          category: string | null
          confidence_score: number | null
          country: string | null
          created_at: string
          data_alignment_status: string | null
          email: string | null
          enriched_at: string | null
          enrichment_confidence: number | null
          enrichment_diagnostics: Json
          enrichment_error: string | null
          enrichment_payload: Json | null
          enrichment_status: string
          facebook_url: string | null
          google_maps_url: string | null
          id: string
          leadgen_id: string | null
          notes: string | null
          opening_hours: Json | null
          phone: string | null
          region: string | null
          review_signals: Json
          risk_flags: Json
          service_areas: Json
          slug: string | null
          social_links: Json
          source: string | null
          source_platform: string | null
          source_urls: Json
          status: string
          suburb: string | null
          trust_flags: Json
          trust_score: number | null
          trust_signal_score: number | null
          trust_signals: Json
          trust_summary: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          categories?: Json
          category?: string | null
          confidence_score?: number | null
          country?: string | null
          created_at?: string
          data_alignment_status?: string | null
          email?: string | null
          enriched_at?: string | null
          enrichment_confidence?: number | null
          enrichment_diagnostics?: Json
          enrichment_error?: string | null
          enrichment_payload?: Json | null
          enrichment_status?: string
          facebook_url?: string | null
          google_maps_url?: string | null
          id?: string
          leadgen_id?: string | null
          notes?: string | null
          opening_hours?: Json | null
          phone?: string | null
          region?: string | null
          review_signals?: Json
          risk_flags?: Json
          service_areas?: Json
          slug?: string | null
          social_links?: Json
          source?: string | null
          source_platform?: string | null
          source_urls?: Json
          status?: string
          suburb?: string | null
          trust_flags?: Json
          trust_score?: number | null
          trust_signal_score?: number | null
          trust_signals?: Json
          trust_summary?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          categories?: Json
          category?: string | null
          confidence_score?: number | null
          country?: string | null
          created_at?: string
          data_alignment_status?: string | null
          email?: string | null
          enriched_at?: string | null
          enrichment_confidence?: number | null
          enrichment_diagnostics?: Json
          enrichment_error?: string | null
          enrichment_payload?: Json | null
          enrichment_status?: string
          facebook_url?: string | null
          google_maps_url?: string | null
          id?: string
          leadgen_id?: string | null
          notes?: string | null
          opening_hours?: Json | null
          phone?: string | null
          region?: string | null
          review_signals?: Json
          risk_flags?: Json
          service_areas?: Json
          slug?: string | null
          social_links?: Json
          source?: string | null
          source_platform?: string | null
          source_urls?: Json
          status?: string
          suburb?: string | null
          trust_flags?: Json
          trust_score?: number | null
          trust_signal_score?: number | null
          trust_signals?: Json
          trust_summary?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      local_business_outreach_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_business_outreach_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "local_business_outreach_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      paperclip_execution_queue: {
        Row: {
          attempts: number
          canonical_event_type: string
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          priority: number | null
          route_id: string
          source_event_id: string
          status: string
          target_action: string
          target_owner: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          canonical_event_type: string
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          priority?: number | null
          route_id: string
          source_event_id: string
          status?: string
          target_action: string
          target_owner?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          canonical_event_type?: string
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          priority?: number | null
          route_id?: string
          source_event_id?: string
          status?: string
          target_action?: string
          target_owner?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paperclip_execution_queue_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "event_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
        ]
      }
      pipeline_events: {
        Row: {
          created_at: string | null
          error_text: string | null
          event_type: string
          id: string
          payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string | null
          error_text?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          status: string
        }
        Update: {
          created_at?: string | null
          error_text?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          status?: string
        }
        Relationships: []
      }
      publish_runs: {
        Row: {
          attempt_no: number
          completed_at: string | null
          content_item_id: string | null
          error_detail: string | null
          external_id: string | null
          external_url: string | null
          id: string
          payload: Json
          result_summary: string | null
          run_status: string
          started_at: string
          target_system: string
        }
        Insert: {
          attempt_no?: number
          completed_at?: string | null
          content_item_id?: string | null
          error_detail?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          payload?: Json
          result_summary?: string | null
          run_status: string
          started_at?: string
          target_system: string
        }
        Update: {
          attempt_no?: number
          completed_at?: string | null
          content_item_id?: string | null
          error_detail?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          payload?: Json
          result_summary?: string | null
          run_status?: string
          started_at?: string
          target_system?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_decisions: {
        Row: {
          action: string
          confidence: number | null
          created_at: string
          event_id: string | null
          id: string
          mode: string
          quality_gate: string | null
          reason: string
          target_agent: string | null
          task_id: string
        }
        Insert: {
          action: string
          confidence?: number | null
          created_at?: string
          event_id?: string | null
          id?: string
          mode: string
          quality_gate?: string | null
          reason: string
          target_agent?: string | null
          task_id: string
        }
        Update: {
          action?: string
          confidence?: number | null
          created_at?: string
          event_id?: string | null
          id?: string
          mode?: string
          quality_gate?: string | null
          reason?: string
          target_agent?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_decisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "task_events"
            referencedColumns: ["id"]
          },
        ]
      }
      service_tickets: {
        Row: {
          assigned_team: string
          created_at: string | null
          id: string
          inquiry_id: string
          payload: Json
          status: string
        }
        Insert: {
          assigned_team?: string
          created_at?: string | null
          id?: string
          inquiry_id: string
          payload: Json
          status?: string
        }
        Update: {
          assigned_team?: string
          created_at?: string | null
          id?: string
          inquiry_id?: string
          payload?: Json
          status?: string
        }
        Relationships: []
      }
      social_engagement_signals: {
        Row: {
          comment_id: string | null
          created_at: string
          external_actor_id: string | null
          external_actor_name: string | null
          external_event_id: string | null
          id: string
          intent_label: string | null
          intent_score: number | null
          message_id: string | null
          message_text: string | null
          page_id: string | null
          post_id: string | null
          raw_payload: Json
          reaction_type: string | null
          related_lead_id: string | null
          signal_type: string
          source_platform: string
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          external_actor_id?: string | null
          external_actor_name?: string | null
          external_event_id?: string | null
          id?: string
          intent_label?: string | null
          intent_score?: number | null
          message_id?: string | null
          message_text?: string | null
          page_id?: string | null
          post_id?: string | null
          raw_payload?: Json
          reaction_type?: string | null
          related_lead_id?: string | null
          signal_type: string
          source_platform: string
          source_system?: string
          status?: string
          updated_at?: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          external_actor_id?: string | null
          external_actor_name?: string | null
          external_event_id?: string | null
          id?: string
          intent_label?: string | null
          intent_score?: number | null
          message_id?: string | null
          message_text?: string | null
          page_id?: string | null
          post_id?: string | null
          raw_payload?: Json
          reaction_type?: string | null
          related_lead_id?: string | null
          signal_type?: string
          source_platform?: string
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_engagement_signals_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_lead_pipeline_view"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "social_engagement_signals_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "local_business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          created_at: string
          id: string
          last_cursor: string | null
          last_synced_at: string | null
          metadata: Json
          sync_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_cursor?: string | null
          last_synced_at?: string | null
          metadata?: Json
          sync_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_cursor?: string | null
          last_synced_at?: string | null
          metadata?: Json
          sync_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          label: string
          slug: string
          system_managed: boolean
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label: string
          slug: string
          system_managed?: boolean
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          slug?: string
          system_managed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      task_events: {
        Row: {
          actor: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          task_id: string
        }
        Insert: {
          actor: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          task_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          task_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          id: string
          owner: string | null
          payload: Json
          priority: string | null
          risk_assertions: string[] | null
          risk_category: string | null
          source_event_id: string | null
          status: string
          task_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner?: string | null
          payload?: Json
          priority?: string | null
          risk_assertions?: string[] | null
          risk_category?: string | null
          source_event_id?: string | null
          status?: string
          task_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner?: string | null
          payload?: Json
          priority?: string | null
          risk_assertions?: string[] | null
          risk_category?: string | null
          source_event_id?: string | null
          status?: string
          task_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "tasks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "tasks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
        ]
      }
    }
    Views: {
      cockpit_available_actions: {
        Row: {
          actions: string[] | null
          object_id: string | null
          object_type: string | null
          status: string | null
        }
        Relationships: []
      }
      cockpit_event_stream: {
        Row: {
          canonical_event_type: string | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_ref: string | null
          entity_type: string | null
          event_taxonomy_version: string | null
          event_type: string | null
          id: string | null
          payload: Json | null
          queued_count: number | null
          risk_assertions: string[] | null
          risk_category: string | null
          risk_version: string | null
          route_count: number | null
          route_failed_count: number | null
          run_id: string | null
          skipped_count: number | null
          source_system: string | null
          status: string | null
          taxonomy_category: string | null
          taxonomy_description: string | null
        }
        Relationships: []
      }
      cockpit_exceptions: {
        Row: {
          attempts: number | null
          canonical_event_type: string | null
          created_at: string | null
          exception_type: string | null
          message: string | null
          object_id: string | null
          payload: Json | null
          priority: number | null
          source_event_id: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      cockpit_hero_journey_card: {
        Row: {
          candidate_count: number | null
          description: string | null
          first_candidate: Json | null
          highest_priority: number | null
          journey_key: string | null
          mode_key: string | null
          oldest_age_seconds: number | null
          raw: Json | null
          recommended_action: string | null
          steps: Json | null
          title: string | null
        }
        Relationships: []
      }
      cockpit_journey_candidates: {
        Row: {
          age_seconds: number | null
          allowed_actions: string[] | null
          journey_key: string | null
          journey_title: string | null
          message: string | null
          object_id: string | null
          object_type: string | null
          payload: Json | null
          priority: number | null
          recommended_action: string | null
          status: string | null
        }
        Relationships: []
      }
      cockpit_journey_summary: {
        Row: {
          candidate_count: number | null
          candidates: Json | null
          default_priority: number | null
          description: string | null
          entry_condition: string | null
          highest_priority: number | null
          journey_key: string | null
          mode_key: string | null
          oldest_age_seconds: number | null
          success_condition: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_operator_journeys_mode_key_fkey"
            columns: ["mode_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_mode_summary"
            referencedColumns: ["mode_key"]
          },
          {
            foreignKeyName: "cockpit_operator_journeys_mode_key_fkey"
            columns: ["mode_key"]
            isOneToOne: false
            referencedRelation: "cockpit_operator_modes"
            referencedColumns: ["mode_key"]
          },
        ]
      }
      cockpit_lead_activity_timeline_view: {
        Row: {
          actor: string | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_id: string | null
          event_label: string | null
          event_type: string | null
          lead_id: string | null
          payload: Json | null
          source_system: string | null
          status: string | null
          summary: string | null
        }
        Insert: {
          actor?: string | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_id?: string | null
          event_label?: never
          event_type?: string | null
          lead_id?: string | null
          payload?: Json | null
          source_system?: string | null
          status?: string | null
          summary?: never
        }
        Update: {
          actor?: string | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_id?: string | null
          event_label?: never
          event_type?: string | null
          lead_id?: string | null
          payload?: Json | null
          source_system?: string | null
          status?: string | null
          summary?: never
        }
        Relationships: []
      }
      cockpit_lead_tags_view: {
        Row: {
          confidence: number | null
          created_at: string | null
          created_by: string | null
          entity_tag_id: string | null
          lead_id: string | null
          source: string | null
          system_managed: boolean | null
          tag_category: string | null
          tag_color: string | null
          tag_description: string | null
          tag_id: string | null
          tag_label: string | null
          tag_slug: string | null
        }
        Relationships: []
      }
      cockpit_operating_summary: {
        Row: {
          blocked_issues: number | null
          events_24h: number | null
          issues_created_24h: number | null
          open_issues: number | null
          queue_claimed: number | null
          queue_failed: number | null
          queue_waiting: number | null
          queued_24h: number | null
          routes_skipped: number | null
        }
        Relationships: []
      }
      cockpit_operator_mode_summary: {
        Row: {
          category: string | null
          default_order: number | null
          description: string | null
          highest_priority: number | null
          item_count: number | null
          mode_key: string | null
          oldest_age_seconds: number | null
          title: string | null
          workflows: Json | null
        }
        Relationships: []
      }
      cockpit_paperclip_issues: {
        Row: {
          age_seconds: number | null
          created_at: string | null
          current_owner: string | null
          description: string | null
          event_count: number | null
          issue_id: string | null
          last_event_at: string | null
          last_event_type: string | null
          payload: Json | null
          priority: string | null
          routing_decision_count: number | null
          source_ref: string | null
          source_system: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      cockpit_route_queue: {
        Row: {
          age_seconds: number | null
          attempts: number | null
          canonical_event_type: string | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_ref: string | null
          entity_type: string | null
          event_type: string | null
          last_error: string | null
          payload: Json | null
          priority: number | null
          queue_id: string | null
          risk_assertions: string[] | null
          risk_category: string | null
          route_id: string | null
          route_key: string | null
          route_notes: string | null
          source_event_id: string | null
          source_system: string | null
          status: string | null
          target_action: string | null
          target_layer: string | null
          target_owner: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paperclip_execution_queue_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "event_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_event_stream"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "cockpit_lead_activity_timeline_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "event_routing_view"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperclip_execution_queue_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "lead_cockpit_view"
            referencedColumns: ["event_id"]
          },
        ]
      }
      cockpit_ui_action_map: {
        Row: {
          action_key: string | null
          contract: Json | null
          description: string | null
          function_name: string | null
          label: string | null
        }
        Relationships: []
      }
      cockpit_ui_home_sections: {
        Row: {
          description: string | null
          display_order: number | null
          section_key: string | null
          title: string | null
          ui_contract: Json | null
        }
        Relationships: []
      }
      cockpit_workflow_queue: {
        Row: {
          age_seconds: number | null
          category: string | null
          description: string | null
          message: string | null
          object_id: string | null
          object_type: string | null
          payload: Json | null
          priority: number | null
          recommended_actions: string[] | null
          status: string | null
          title: string | null
          workflow_key: string | null
        }
        Relationships: []
      }
      cockpit_workflow_summary: {
        Row: {
          category: string | null
          description: string | null
          highest_priority: number | null
          item_count: number | null
          oldest_age_seconds: number | null
          priority: number | null
          recommended_actions: string[] | null
          title: string | null
          workflow_key: string | null
        }
        Relationships: []
      }
      content_asset_lineage_view: {
        Row: {
          asset_id: string | null
          created_at: string | null
          derived_from_event_id: string | null
          descendant_asset_id: string | null
          distance_from_descendant: number | null
          generation_reason: string | null
          lineage_depth: number | null
          output_type: string | null
          parent_asset_id: string | null
          review_state: string | null
          status: string | null
        }
        Relationships: []
      }
      content_review_queue_view: {
        Row: {
          body: string | null
          created_at: string | null
          id: string | null
          package_brief: string | null
          package_id: string | null
          package_source: string | null
          package_title: string | null
          parent_output_id: string | null
          queue_bucket: string | null
          review_state: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_outputs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "content_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_parent_output_id_fkey"
            columns: ["parent_output_id"]
            isOneToOne: false
            referencedRelation: "content_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_outputs_parent_output_id_fkey"
            columns: ["parent_output_id"]
            isOneToOne: false
            referencedRelation: "content_review_queue_view"
            referencedColumns: ["id"]
          },
        ]
      }
      event_routing_view: {
        Row: {
          canonical_event_type: string | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_ref: string | null
          entity_type: string | null
          event_id: string | null
          event_taxonomy_version: string | null
          event_type: string | null
          priority: number | null
          risk_assertions: string[] | null
          risk_category: string | null
          risk_version: string | null
          route_enabled: boolean | null
          route_key: string | null
          source_system: string | null
          status: string | null
          target_action: string | null
          target_layer: string | null
          target_owner: string | null
        }
        Relationships: []
      }
      lead_cockpit_view: {
        Row: {
          assigned_agent: string | null
          captured_at: string | null
          email: string | null
          event_id: string | null
          event_status: string | null
          issue_id: string | null
          issue_status: string | null
          lead_id: string | null
          message: string | null
          metadata: Json | null
          name: string | null
          phone: string | null
          priority: string | null
          resolved_at: string | null
          routed_at: string | null
          source: string | null
          source_system: string | null
          workflow_state: string | null
        }
        Insert: {
          assigned_agent?: never
          captured_at?: string | null
          email?: string | null
          event_id?: string | null
          event_status?: string | null
          issue_id?: never
          issue_status?: never
          lead_id?: string | null
          message?: never
          metadata?: never
          name?: never
          phone?: never
          priority?: never
          resolved_at?: never
          routed_at?: never
          source?: never
          source_system?: string | null
          workflow_state?: never
        }
        Update: {
          assigned_agent?: never
          captured_at?: string | null
          email?: string | null
          event_id?: string | null
          event_status?: string | null
          issue_id?: never
          issue_status?: never
          lead_id?: string | null
          message?: never
          metadata?: never
          name?: never
          phone?: never
          priority?: never
          resolved_at?: never
          routed_at?: never
          source?: never
          source_system?: string | null
          workflow_state?: never
        }
        Relationships: []
      }
      local_business_lead_pipeline_view: {
        Row: {
          address: string | null
          ai_readiness_score: number | null
          assessment_id: string | null
          assessment_summary: string | null
          business_name: string | null
          campaign_name: string | null
          categories: Json | null
          category: string | null
          confidence_score: number | null
          conversion_maturity_score: number | null
          country: string | null
          data_alignment_status: string | null
          demand_signal_score: number | null
          email: string | null
          enriched_at: string | null
          enrichment_confidence: Json | null
          enrichment_diagnostics: Json | null
          enrichment_status: string | null
          facebook_url: string | null
          google_maps_url: string | null
          latest_assessment_at: string | null
          latest_audit_generated_at: string | null
          latest_audit_pdf_url: string | null
          latest_audit_report_id: string | null
          latest_audit_report_version: string | null
          latest_event_at: string | null
          latest_event_type: string | null
          lead_id: string | null
          leadgen_id: string | null
          opportunity_score: number | null
          phone: string | null
          platform: string | null
          recommended_outreach_angle: string | null
          region: string | null
          review_signals: Json | null
          risk_flags: Json | null
          service_areas: Json | null
          social_links: Json | null
          source: string | null
          source_urls: Json | null
          status: string | null
          suburb: string | null
          trust_flags: Json | null
          trust_leakage_score: number | null
          trust_score: number | null
          trust_signal_score: number | null
          trust_signals: Json | null
          trust_summary: string | null
          website_url: string | null
        }
        Relationships: []
      }
      v_content_brief_test_status: {
        Row: {
          brief_ref: string | null
          briefs_created: number | null
          issues_created: number | null
          items_queued: number | null
          last_event_at: string | null
          outputs_approved: number | null
          outputs_generated: number | null
          run_id: string | null
        }
        Relationships: []
      }
      v_content_briefs: {
        Row: {
          brief_ref: string | null
          created_at: string | null
          current_stage: string | null
          issue_created: number | null
          items_queued: number | null
          last_event_at: string | null
          outputs_approved: number | null
          outputs_generated: number | null
          run_id: string | null
        }
        Relationships: []
      }
      v_content_outputs: {
        Row: {
          brief_ref: string | null
          created_at: string | null
          event_type: string | null
          output_type: string | null
          status: string | null
        }
        Insert: {
          brief_ref?: string | null
          created_at?: string | null
          event_type?: string | null
          output_type?: never
          status?: string | null
        }
        Update: {
          brief_ref?: string | null
          created_at?: string | null
          event_type?: string | null
          output_type?: never
          status?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_content_output:
        | {
            Args: { p_output_event_id: string; p_reviewed_by?: string }
            Returns: string
          }
        | { Args: { p_output_id: string }; Returns: undefined }
      canonicalize_event_type: {
        Args: { raw_event_type: string }
        Returns: string
      }
      claim_paperclip_execution_items: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          canonical_event_type: string
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          priority: number | null
          route_id: string
          source_event_id: string
          status: string
          target_action: string
          target_owner: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "paperclip_execution_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cockpit_cancel_item: {
        Args: { queue_id: string; reason?: string }
        Returns: Json
      }
      cockpit_close_issue: {
        Args: { issue_id: string; reason?: string }
        Returns: Json
      }
      cockpit_escalate_issue: {
        Args: { issue_id: string; reason?: string; target_owner?: string }
        Returns: Json
      }
      cockpit_mode_health: { Args: { mode?: string }; Returns: Json }
      cockpit_next_best_action: { Args: { mode?: string }; Returns: Json }
      cockpit_product_home: { Args: never; Returns: Json }
      cockpit_recommended_journey: { Args: { mode?: string }; Returns: Json }
      cockpit_record_journey_outcome: {
        Args: {
          action_taken?: string
          journey_key: string
          object_id: string
          object_type: string
          outcome_status: string
          payload?: Json
          reason?: string
        }
        Returns: Json
      }
      cockpit_requeue_item: {
        Args: { queue_id: string; reason?: string }
        Returns: Json
      }
      cockpit_retry_failed_items: {
        Args: { max_items?: number }
        Returns: Json
      }
      cockpit_ui_bootstrap: { Args: never; Returns: Json }
      cockpit_workflow_health: { Args: never; Returns: Json }
      complete_paperclip_execution_item: {
        Args: { queue_id: string }
        Returns: undefined
      }
      cron_call_trigger_hugo: { Args: never; Returns: undefined }
      emit_local_business_event: {
        Args: {
          p_entity_ref?: string
          p_event_type: string
          p_lead_id: string
          p_payload?: Json
          p_status?: string
        }
        Returns: undefined
      }
      enqueue_content_work: {
        Args: {
          p_approval_required?: boolean
          p_assigned_agent?: string
          p_assigned_role?: string
          p_autonomous_allowed?: boolean
          p_due_at?: string
          p_entity_id: string
          p_entity_type: string
          p_human_required?: boolean
          p_metadata?: Json
          p_priority?: number
          p_publish_blocked?: boolean
          p_queue_type: string
          p_source_event_id?: string
        }
        Returns: string
      }
      event_risk_assertions: { Args: { canonical: string }; Returns: string[] }
      event_risk_category: { Args: { canonical: string }; Returns: string }
      fail_paperclip_execution_item: {
        Args: { error_text: string; max_attempts?: number; queue_id: string }
        Returns: undefined
      }
      generate_content_assets_from_insight: {
        Args: { p_event_id?: string; p_insight_id: string }
        Returns: {
          asset_id: string
          asset_output_type: string
          template_key: string
        }[]
      }
      ingest_content_package: { Args: { p_payload: Json }; Returns: Json }
      reject_content_output:
        | {
            Args: {
              p_output_event_id: string
              p_reason: string
              p_reviewed_by?: string
            }
            Returns: string
          }
        | {
            Args: { p_output_id: string; p_reason: string }
            Returns: undefined
          }
      resolve_canonical_event_type: {
        Args: { raw_event_type: string; raw_source_system?: string }
        Returns: string
      }
      route_event_to_paperclip_queue: {
        Args: { event_id: string }
        Returns: number
      }
      update_contact_lead_status: {
        Args: { contact_id: string; lead_status: string }
        Returns: {
          business_name: string | null
          created_at: string
          email: string | null
          enquiry_type: string | null
          first_seen_at: string
          full_name: string | null
          id: string
          last_seen_at: string
          lead_status: string
          lifecycle_stage: string
          linkedin_url: string | null
          message: string | null
          metadata: Json
          notes: string | null
          owner: string | null
          phone: string | null
          relationship_types: string[]
          source_record_id: string | null
          source_system: string
          status: string
          tags: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "contacts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

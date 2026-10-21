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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_accounts: {
        Row: {
          created_at: string
          email: string
          invited_by: string | null
          last_login_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          invited_by?: string | null
          last_login_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string | null
          last_login_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          permissions: string[]
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash?: string
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          category: string
          key: string
          label: string
        }
        Insert: {
          category: string
          key: string
          label: string
        }
        Update: {
          category?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      admin_user_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      app_settings: {
        Row: {
          is_sensitive: boolean
          key: string
          label: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_sensitive?: boolean
          key: string
          label?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          is_sensitive?: boolean
          key?: string
          label?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          result: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          result?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          result?: string
        }
        Relationships: []
      }
      beneficiary_swaps: {
        Row: {
          created_at: string
          direction: string
          from_member_id: string
          from_position: number
          id: string
          status: string
          to_member_id: string
          to_position: number
          tontine_id: string
          updated_at: string
          vote_id: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          from_member_id: string
          from_position: number
          id?: string
          status?: string
          to_member_id: string
          to_position: number
          tontine_id: string
          updated_at?: string
          vote_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          from_member_id?: string
          from_position?: number
          id?: string
          status?: string
          to_member_id?: string
          to_position?: number
          tontine_id?: string
          updated_at?: string
          vote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiary_swaps_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_swaps_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_swaps_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiary_swaps_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "group_votes"
            referencedColumns: ["id"]
          },
        ]
      }
      contribution_periods: {
        Row: {
          beneficiary_member_id: string | null
          created_at: string
          due_date: string
          id: string
          idx: number
          legacy_ref: string | null
          status: string
          tontine_id: string
        }
        Insert: {
          beneficiary_member_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          idx: number
          legacy_ref?: string | null
          status?: string
          tontine_id: string
        }
        Update: {
          beneficiary_member_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          idx?: number
          legacy_ref?: string | null
          status?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contribution_periods_beneficiary_member_id_fkey"
            columns: ["beneficiary_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contribution_periods_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          id: string
          member_id: string
          period_id: string
          status: string
          tontine_id: string
          updated_at: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          id?: string
          member_id: string
          period_id: string
          status?: string
          tontine_id: string
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          member_id?: string
          period_id?: string
          status?: string
          tontine_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "contribution_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: string
          message: string
          tontine_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message: string
          tontine_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_activity_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_admin_changes: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          new_principal: string | null
          new_second: string | null
          old_principal: string | null
          old_second: string | null
          permissions: string[]
          reason: string
          tontine_id: string
          trigger_action: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_principal?: string | null
          new_second?: string | null
          old_principal?: string | null
          old_second?: string | null
          permissions?: string[]
          reason: string
          tontine_id: string
          trigger_action: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_principal?: string | null
          new_second?: string | null
          old_principal?: string | null
          old_second?: string | null
          permissions?: string[]
          reason?: string
          tontine_id?: string
          trigger_action?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_admin_changes_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_eligibility: {
        Row: {
          active_members: number
          age_months: number
          c_age: boolean
          c_members: boolean
          c_period_late: boolean
          c_successful: boolean
          c_year_late: boolean
          closed_periods: number
          computed_at: string
          eligible: boolean
          last_period_late: number
          period_state: string
          progress: number
          recovery_streak: number
          successful_periods: number
          thresholds: Json
          tontine_id: string
          year: number
          year_late: number
        }
        Insert: {
          active_members?: number
          age_months?: number
          c_age?: boolean
          c_members?: boolean
          c_period_late?: boolean
          c_successful?: boolean
          c_year_late?: boolean
          closed_periods?: number
          computed_at?: string
          eligible?: boolean
          last_period_late?: number
          period_state?: string
          progress?: number
          recovery_streak?: number
          successful_periods?: number
          thresholds?: Json
          tontine_id: string
          year: number
          year_late?: number
        }
        Update: {
          active_members?: number
          age_months?: number
          c_age?: boolean
          c_members?: boolean
          c_period_late?: boolean
          c_successful?: boolean
          c_year_late?: boolean
          closed_periods?: number
          computed_at?: string
          eligible?: boolean
          last_period_late?: number
          period_state?: string
          progress?: number
          recovery_streak?: number
          successful_periods?: number
          thresholds?: Json
          tontine_id?: string
          year?: number
          year_late?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_eligibility_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: true
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_eligibility_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          new_value: Json | null
          old_value: Json | null
          period_id: string | null
          reason: string
          tontine_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          new_value?: Json | null
          old_value?: Json | null
          period_id?: string | null
          reason: string
          tontine_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          new_value?: Json | null
          old_value?: Json | null
          period_id?: string | null
          reason?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_eligibility_events_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "contribution_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_eligibility_events_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_period_performance: {
        Row: {
          closed: boolean
          computed_at: string
          due_date: string
          idx: number
          late_count: number
          members_count: number
          paid_count: number
          period_id: string
          successful: boolean
          tontine_id: string
        }
        Insert: {
          closed?: boolean
          computed_at?: string
          due_date: string
          idx: number
          late_count?: number
          members_count?: number
          paid_count?: number
          period_id: string
          successful?: boolean
          tontine_id: string
        }
        Update: {
          closed?: boolean
          computed_at?: string
          due_date?: string
          idx?: number
          late_count?: number
          members_count?: number
          paid_count?: number
          period_id?: string
          successful?: boolean
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_period_performance_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "contribution_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_period_performance_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_pricing_tiers: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          effective_from: string
          id: string
          label: string
          max_members: number | null
          min_members: number
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          label: string
          max_members?: number | null
          min_members: number
          price: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          label?: string
          max_members?: number | null
          min_members?: number
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      group_subscriptions: {
        Row: {
          created_at: string
          currency: string
          cycle_idx: number | null
          due_date: string | null
          group_name: string
          group_ref: string
          id: string
          member_count: number
          paid_at: string | null
          payer_member_id: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          price_locked: number
          status: string
          tier_id: string | null
          tier_label: string | null
          tontine_id: string | null
          transaction_ref: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          cycle_idx?: number | null
          due_date?: string | null
          group_name: string
          group_ref: string
          id?: string
          member_count: number
          paid_at?: string | null
          payer_member_id?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          price_locked: number
          status?: string
          tier_id?: string | null
          tier_label?: string | null
          tontine_id?: string | null
          transaction_ref?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          cycle_idx?: number | null
          due_date?: string | null
          group_name?: string
          group_ref?: string
          id?: string
          member_count?: number
          paid_at?: string | null
          payer_member_id?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          price_locked?: number
          status?: string
          tier_id?: string | null
          tier_label?: string | null
          tontine_id?: string | null
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_subscriptions_payer_member_id_fkey"
            columns: ["payer_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "group_pricing_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_subscriptions_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      group_votes: {
        Row: {
          created_at: string
          created_by: string | null
          deadline: string
          description: string | null
          id: string
          status: string
          swap_id: string | null
          threshold: string
          title: string
          tontine_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deadline: string
          description?: string | null
          id?: string
          status?: string
          swap_id?: string | null
          threshold?: string
          title: string
          tontine_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deadline?: string
          description?: string | null
          id?: string
          status?: string
          swap_id?: string | null
          threshold?: string
          title?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_votes_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      late_penalties: {
        Row: {
          amount: number
          contribution_id: string
          created_at: string
          currency: string
          days_late: number
          due_date: string
          id: string
          member_id: string
          paid_at: string | null
          period_id: string
          status: string
          tontine_id: string
          transaction_ref: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          contribution_id: string
          created_at?: string
          currency: string
          days_late?: number
          due_date: string
          id?: string
          member_id: string
          paid_at?: string | null
          period_id: string
          status?: string
          tontine_id: string
          transaction_ref?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          contribution_id?: string
          created_at?: string
          currency?: string
          days_late?: number
          due_date?: string
          id?: string
          member_id?: string
          paid_at?: string | null
          period_id?: string
          status?: string
          tontine_id?: string
          transaction_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_penalties_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: true
            referencedRelation: "contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_penalties_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_penalties_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "contribution_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_penalties_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      member_debts: {
        Row: {
          amount_paid: number
          created_at: string
          creditor_member_id: string | null
          creditor_user_id: string
          currency: string
          debtor_member_id: string | null
          debtor_user_id: string
          due_at: string
          id: string
          interest_amount: number
          interest_enabled: boolean
          interest_rate: number
          original_amount: number
          original_transaction_ref: string
          proxy_request_id: string | null
          reason: string
          remaining_amount: number | null
          settled_at: string | null
          settlement_ref: string | null
          status: string
          tontine_id: string
          total_amount_due: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          creditor_member_id?: string | null
          creditor_user_id: string
          currency: string
          debtor_member_id?: string | null
          debtor_user_id: string
          due_at?: string
          id?: string
          interest_amount?: number
          interest_enabled?: boolean
          interest_rate?: number
          original_amount: number
          original_transaction_ref: string
          proxy_request_id?: string | null
          reason: string
          remaining_amount?: number | null
          settled_at?: string | null
          settlement_ref?: string | null
          status?: string
          tontine_id: string
          total_amount_due: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          creditor_member_id?: string | null
          creditor_user_id?: string
          currency?: string
          debtor_member_id?: string | null
          debtor_user_id?: string
          due_at?: string
          id?: string
          interest_amount?: number
          interest_enabled?: boolean
          interest_rate?: number
          original_amount?: number
          original_transaction_ref?: string
          proxy_request_id?: string | null
          reason?: string
          remaining_amount?: number | null
          settled_at?: string | null
          settlement_ref?: string | null
          status?: string
          tontine_id?: string
          total_amount_due?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_debts_creditor_member_id_fkey"
            columns: ["creditor_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_debts_debtor_member_id_fkey"
            columns: ["debtor_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_debts_proxy_request_id_fkey"
            columns: ["proxy_request_id"]
            isOneToOne: false
            referencedRelation: "proxy_payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_debts_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          kind: string
          read_at: string | null
          sent_at: string | null
          status: string
          title: string
          tontine_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          kind: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          tontine_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          tontine_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          api_base_url: string | null
          countries: string[]
          created_at: string
          currencies: string[]
          enabled: boolean
          environment: string
          id: string
          last_error: string | null
          last_tested_at: string | null
          name: string
          priority: number
          public_key: string | null
          secret_last4: string | null
          secret_ref: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          api_base_url?: string | null
          countries?: string[]
          created_at?: string
          currencies?: string[]
          enabled?: boolean
          environment?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name: string
          priority?: number
          public_key?: string | null
          secret_last4?: string | null
          secret_ref?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_base_url?: string | null
          countries?: string[]
          created_at?: string
          currencies?: string[]
          enabled?: boolean
          environment?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name?: string
          priority?: number
          public_key?: string | null
          secret_last4?: string | null
          secret_ref?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          beneficiary_msisdn: string | null
          beneficiary_user_id: string | null
          contribution_amount: number | null
          created_at: string
          currency: string
          days_late: number
          debt_id: string | null
          due_date: string | null
          due_ref: string | null
          failure_reason: string | null
          group_ref: string | null
          id: string
          idempotency_key: string
          kind: string
          member_id: string | null
          msisdn: string | null
          payout_status: string | null
          penalty_amount: number
          provider_id: string | null
          provider_reference: string | null
          proxy_request_id: string | null
          reference: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          beneficiary_msisdn?: string | null
          beneficiary_user_id?: string | null
          contribution_amount?: number | null
          created_at?: string
          currency: string
          days_late?: number
          debt_id?: string | null
          due_date?: string | null
          due_ref?: string | null
          failure_reason?: string | null
          group_ref?: string | null
          id?: string
          idempotency_key: string
          kind?: string
          member_id?: string | null
          msisdn?: string | null
          payout_status?: string | null
          penalty_amount?: number
          provider_id?: string | null
          provider_reference?: string | null
          proxy_request_id?: string | null
          reference: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          beneficiary_msisdn?: string | null
          beneficiary_user_id?: string | null
          contribution_amount?: number | null
          created_at?: string
          currency?: string
          days_late?: number
          debt_id?: string | null
          due_date?: string | null
          due_ref?: string | null
          failure_reason?: string | null
          group_ref?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          member_id?: string | null
          msisdn?: string | null
          payout_status?: string | null
          penalty_amount?: number
          provider_id?: string | null
          provider_reference?: string | null
          proxy_request_id?: string | null
          reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhooks: {
        Row: {
          event_id: string
          id: string
          payload: Json | null
          processed: boolean
          provider_id: string | null
          received_at: string
          signature_valid: boolean
        }
        Insert: {
          event_id: string
          id?: string
          payload?: Json | null
          processed?: boolean
          provider_id?: string | null
          received_at?: string
          signature_valid?: boolean
        }
        Update: {
          event_id?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          provider_id?: string | null
          received_at?: string
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhooks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      proxy_payment_requests: {
        Row: {
          amount: number
          approval_ref: string | null
          approved_at: string | null
          approved_by: string | null
          contribution_id: string | null
          created_at: string
          currency: string
          debtor_member_id: string
          debtor_penalty: number
          debtor_user_id: string | null
          due_date: string
          id: string
          interest_rate: number
          kind: string
          paid_at: string | null
          payer_member_id: string
          payer_user_id: string
          reimbursement_requested: boolean
          status: string
          subscription_id: string | null
          tontine_id: string
          transaction_ref: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approval_ref?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contribution_id?: string | null
          created_at?: string
          currency: string
          debtor_member_id: string
          debtor_penalty?: number
          debtor_user_id?: string | null
          due_date: string
          id?: string
          interest_rate?: number
          kind: string
          paid_at?: string | null
          payer_member_id: string
          payer_user_id: string
          reimbursement_requested?: boolean
          status?: string
          subscription_id?: string | null
          tontine_id: string
          transaction_ref?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_ref?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contribution_id?: string | null
          created_at?: string
          currency?: string
          debtor_member_id?: string
          debtor_penalty?: number
          debtor_user_id?: string | null
          due_date?: string
          id?: string
          interest_rate?: number
          kind?: string
          paid_at?: string | null
          payer_member_id?: string
          payer_user_id?: string
          reimbursement_requested?: boolean
          status?: string
          subscription_id?: string | null
          tontine_id?: string
          transaction_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proxy_payment_requests_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_payment_requests_debtor_member_id_fkey"
            columns: ["debtor_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_payment_requests_payer_member_id_fkey"
            columns: ["payer_member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_payment_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "group_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_payment_requests_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_providers: {
        Row: {
          account_sid: string | null
          api_base_url: string | null
          countries: string[]
          created_at: string
          enabled: boolean
          environment: string
          from_number: string | null
          id: string
          last_error: string | null
          last_tested_at: string | null
          name: string
          secret_last4: string | null
          secret_ref: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          account_sid?: string | null
          api_base_url?: string | null
          countries?: string[]
          created_at?: string
          enabled?: boolean
          environment?: string
          from_number?: string | null
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name: string
          secret_last4?: string | null
          secret_ref?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_sid?: string | null
          api_base_url?: string | null
          countries?: string[]
          created_at?: string
          enabled?: boolean
          environment?: string
          from_number?: string | null
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name?: string
          secret_last4?: string | null
          secret_ref?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          area: string
          created_at: string
          detail: Json | null
          id: string
          level: string
          message: string
        }
        Insert: {
          area: string
          created_at?: string
          detail?: Json | null
          id?: string
          level?: string
          message: string
        }
        Update: {
          area?: string
          created_at?: string
          detail?: Json | null
          id?: string
          level?: string
          message?: string
        }
        Relationships: []
      }
      tontine_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          invited_by: string | null
          phone: string | null
          status: string
          tontine_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          phone?: string | null
          status?: string
          tontine_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          phone?: string | null
          status?: string
          tontine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tontine_invitations_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      tontine_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          name: string
          override_disputes: boolean
          phone: string
          status: string
          tontine_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          name?: string
          override_disputes?: boolean
          phone?: string
          status?: string
          tontine_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          name?: string
          override_disputes?: boolean
          phone?: string
          status?: string
          tontine_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tontine_join_requests_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      tontine_members: {
        Row: {
          acceptance: string
          admin_permissions: string[]
          created_at: string
          id: string
          legacy_ref: string | null
          name: string
          phone: string
          position: number
          role: string
          status: string
          tontine_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acceptance?: string
          admin_permissions?: string[]
          created_at?: string
          id?: string
          legacy_ref?: string | null
          name: string
          phone: string
          position?: number
          role?: string
          status?: string
          tontine_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acceptance?: string
          admin_permissions?: string[]
          created_at?: string
          id?: string
          legacy_ref?: string | null
          name?: string
          phone?: string
          position?: number
          role?: string
          status?: string
          tontine_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tontine_members_tontine_id_fkey"
            columns: ["tontine_id"]
            isOneToOne: false
            referencedRelation: "tontines"
            referencedColumns: ["id"]
          },
        ]
      }
      tontines: {
        Row: {
          admin_last_active_at: string
          amount: number
          archived_at: string | null
          created_at: string
          created_by: string
          currency: string
          custom_days: number[]
          day_mode: string
          description: string | null
          frequency: string
          group_type: string
          id: string
          invite_expires_at: string | null
          invite_revoked_at: string | null
          invite_token: string
          last_financial_activity_at: string
          late_penalty_amount: number
          late_penalty_enabled: boolean
          launched_at: string | null
          legacy_ref: string | null
          max_members: number
          name: string
          needs_second_admin: boolean
          photo_url: string | null
          reminders: Json
          rules: Json
          start_date: string
          status: string
          sub_allow_others: boolean
          sub_next_payer: string | null
          sub_payer_mode: string | null
          sub_payer_order: string[]
          total_dues: number
          updated_at: string
        }
        Insert: {
          admin_last_active_at?: string
          amount: number
          archived_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          custom_days?: number[]
          day_mode?: string
          description?: string | null
          frequency?: string
          group_type?: string
          id?: string
          invite_expires_at?: string | null
          invite_revoked_at?: string | null
          invite_token?: string
          last_financial_activity_at?: string
          late_penalty_amount?: number
          late_penalty_enabled?: boolean
          launched_at?: string | null
          legacy_ref?: string | null
          max_members?: number
          name: string
          needs_second_admin?: boolean
          photo_url?: string | null
          reminders?: Json
          rules?: Json
          start_date?: string
          status?: string
          sub_allow_others?: boolean
          sub_next_payer?: string | null
          sub_payer_mode?: string | null
          sub_payer_order?: string[]
          total_dues?: number
          updated_at?: string
        }
        Update: {
          admin_last_active_at?: string
          amount?: number
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          custom_days?: number[]
          day_mode?: string
          description?: string | null
          frequency?: string
          group_type?: string
          id?: string
          invite_expires_at?: string | null
          invite_revoked_at?: string | null
          invite_token?: string
          last_financial_activity_at?: string
          late_penalty_amount?: number
          late_penalty_enabled?: boolean
          launched_at?: string | null
          legacy_ref?: string | null
          max_members?: number
          name?: string
          needs_second_admin?: boolean
          photo_url?: string | null
          reminders?: Json
          rules?: Json
          start_date?: string
          status?: string
          sub_allow_others?: boolean
          sub_next_payer?: string | null
          sub_payer_mode?: string | null
          sub_payer_order?: string[]
          total_dues?: number
          updated_at?: string
        }
        Relationships: []
      }
      ui_translations: {
        Row: {
          created_at: string
          lang: string
          source: string
          translated: string
        }
        Insert: {
          created_at?: string
          lang: string
          source: string
          translated: string
        }
        Update: {
          created_at?: string
          lang?: string
          source?: string
          translated?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vote_responses: {
        Row: {
          answer: string
          created_at: string
          id: string
          member_id: string
          vote_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          member_id: string
          vote_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          member_id?: string
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tontine_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_responses_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "group_votes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_payment_success: {
        Args: { _reference: string }
        Returns: undefined
      }
      credit_setting: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tontine_admin: {
        Args: { _tontine_id: string; _user_id: string }
        Returns: boolean
      }
      is_tontine_member: {
        Args: { _tontine_id: string; _user_id: string }
        Returns: boolean
      }
      recompute_all_group_eligibility: { Args: never; Returns: number }
      recompute_group_eligibility: {
        Args: { _today?: string; _tontine_id: string }
        Returns: undefined
      }
      run_group_governance: { Args: { _now?: string }; Returns: Json }
      sync_group_subscription: {
        Args: { _tontine_id: string }
        Returns: undefined
      }
      transfer_ownership: {
        Args: { _from: string; _keep_as_admin: boolean; _to: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "user"],
    },
  },
} as const

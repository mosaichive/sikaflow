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
      audit_log: {
        Row: {
          action: string
          business_id: string | null
          created_at: string
          details: string | null
          id: string
          performed_by: string
          performed_by_name: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          performed_by: string
          performed_by_name?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          performed_by?: string
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          bank_name: string
          branch: string | null
          business_id: string
          created_at: string
          id: string
          mobile_money_name: string | null
          mobile_money_number: string | null
          note: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name: string
          branch?: string | null
          business_id: string
          created_at?: string
          id?: string
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          note?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          branch?: string | null
          business_id?: string
          created_at?: string
          id?: string
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          email: string | null
          email_verified: boolean
          id: string
          location: string | null
          logo_dark_url: string | null
          logo_light_url: string | null
          name: string
          number_of_employees: number | null
          owner_user_id: string | null
          phone: string | null
          phone_verified: boolean
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          location?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name: string
          number_of_employees?: number | null
          owner_user_id?: string | null
          phone?: string | null
          phone_verified?: boolean
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          location?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          name?: string
          number_of_employees?: number | null
          owner_user_id?: string | null
          phone?: string | null
          phone_verified?: boolean
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          recorded_by: string
          recorded_by_name: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          recorded_by: string
          recorded_by_name?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          recorded_by?: string
          recorded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          duration: string | null
          expected_return: number | null
          id: string
          investment_date: string
          investment_name: string
          note: string | null
          recorded_by: string
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          duration?: string | null
          expected_return?: number | null
          id?: string
          investment_date?: string
          investment_name: string
          note?: string | null
          recorded_by: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          duration?: string | null
          expected_return?: number | null
          id?: string
          investment_date?: string
          investment_name?: string
          note?: string | null
          recorded_by?: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_funding: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          date_received: string
          email: string | null
          expected_return: number | null
          id: string
          investment_type: string | null
          investor_name: string
          note: string | null
          payment_method: string
          phone: string | null
          recorded_by: string
          reference: string | null
          repayment_terms: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          date_received?: string
          email?: string | null
          expected_return?: number | null
          id?: string
          investment_type?: string | null
          investor_name: string
          note?: string | null
          payment_method?: string
          phone?: string | null
          recorded_by: string
          reference?: string | null
          repayment_terms?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          date_received?: string
          email?: string | null
          expected_return?: number | null
          id?: string
          investment_type?: string | null
          investor_name?: string
          note?: string | null
          payment_method?: string
          phone?: string | null
          recorded_by?: string
          reference?: string | null
          repayment_terms?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_funding_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_funding_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_otps: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
          used: boolean
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
          used?: boolean
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
          used?: boolean
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_ghs: number
          business_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          discount_ghs: number
          id: string
          method: string
          note: string | null
          payer_name: string | null
          payer_phone: string | null
          payment_date: string
          paystack_reference: string | null
          plan: string
          reference: string | null
          status: string
          submitted_by: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_ghs?: number
          business_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          discount_ghs?: number
          id?: string
          method?: string
          note?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_date?: string
          paystack_reference?: string | null
          plan: string
          reference?: string | null
          status?: string
          submitted_by?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_ghs?: number
          business_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          discount_ghs?: number
          id?: string
          method?: string
          note?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_date?: string
          paystack_reference?: string | null
          plan?: string
          reference?: string | null
          status?: string
          submitted_by?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          active: boolean
          audience: string
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          level: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          level?: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          level?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          performed_by: string
          performed_by_email: string | null
          target_business_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by: string
          performed_by_email?: string | null
          target_business_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string
          performed_by_email?: string | null
          target_business_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_log_target_business_id_fkey"
            columns: ["target_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_methods: {
        Row: {
          active: boolean
          badge: string | null
          created_at: string
          created_by: string | null
          details: Json
          id: string
          instructions: string | null
          kind: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          instructions?: string | null
          kind: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          instructions?: string | null
          kind?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          business_id: string
          category: string
          colors: string[] | null
          cost_price: number
          created_at: string
          id: string
          image_url: string | null
          name: string
          quantity: number
          reorder_level: number
          selling_price: number
          sizes: string[] | null
          sku: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          business_id: string
          category?: string
          colors?: string[] | null
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          quantity?: number
          reorder_level?: number
          selling_price?: number
          sizes?: string[] | null
          sku: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          business_id?: string
          category?: string
          colors?: string[] | null
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          quantity?: number
          reorder_level?: number
          selling_price?: number
          sizes?: string[] | null
          sku?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          business_id: string | null
          created_at: string
          display_name: string | null
          email_verified: boolean
          id: string
          phone: string | null
          phone_verified: boolean
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          business_id?: string | null
          created_at?: string
          display_name?: string | null
          email_verified?: boolean
          id?: string
          phone?: string | null
          phone_verified?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          business_id?: string | null
          created_at?: string
          display_name?: string | null
          email_verified?: boolean
          id?: string
          phone?: string | null
          phone_verified?: boolean
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      restocks: {
        Row: {
          bank_account_id: string | null
          business_id: string
          category: string
          cost_price_per_unit: number
          created_at: string
          id: string
          note: string | null
          payment_method: string
          product_id: string | null
          product_name: string
          quantity_added: number
          recorded_by: string
          recorded_by_name: string | null
          reference: string | null
          restock_date: string
          sku: string
          status: string
          supplier: string | null
          total_cost: number
          updated_at: string
        }
        Insert: {
          bank_account_id?: string | null
          business_id: string
          category?: string
          cost_price_per_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          payment_method?: string
          product_id?: string | null
          product_name: string
          quantity_added?: number
          recorded_by: string
          recorded_by_name?: string | null
          reference?: string | null
          restock_date?: string
          sku?: string
          status?: string
          supplier?: string | null
          total_cost?: number
          updated_at?: string
        }
        Update: {
          bank_account_id?: string | null
          business_id?: string
          category?: string
          cost_price_per_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          payment_method?: string
          product_id?: string | null
          product_name?: string
          quantity_added?: number
          recorded_by?: string
          recorded_by_name?: string | null
          reference?: string | null
          restock_date?: string
          sku?: string
          status?: string
          supplier?: string | null
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restocks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restocks_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          business_id: string
          color: string | null
          cost_price: number
          created_at: string
          default_price: number
          id: string
          line_total: number
          price_note: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          size: string | null
          sku: string | null
          unit_price: number
        }
        Insert: {
          business_id: string
          color?: string | null
          cost_price?: number
          created_at?: string
          default_price?: number
          id?: string
          line_total?: number
          price_note?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          size?: string | null
          sku?: string | null
          unit_price?: number
        }
        Update: {
          business_id?: string
          color?: string | null
          cost_price?: number
          created_at?: string
          default_price?: number
          id?: string
          line_total?: number
          price_note?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          size?: string | null
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          balance: number
          business_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          notes: string | null
          payment_method: string
          payment_status: string
          sale_date: string
          staff_id: string
          staff_name: string | null
          subtotal: number
          total: number
        }
        Insert: {
          amount_paid?: number
          balance?: number
          business_id: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: string
          payment_status?: string
          sale_date?: string
          staff_id: string
          staff_name?: string | null
          subtotal?: number
          total?: number
        }
        Update: {
          amount_paid?: number
          balance?: number
          business_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: string
          payment_status?: string
          sale_date?: string
          staff_id?: string
          staff_name?: string | null
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      savings: {
        Row: {
          amount: number
          bank_account_id: string | null
          business_id: string
          created_at: string
          id: string
          note: string | null
          recorded_by: string
          reference: string | null
          savings_date: string
          source: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          note?: string | null
          recorded_by: string
          reference?: string | null
          savings_date?: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          note?: string | null
          recorded_by?: string
          reference?: string | null
          savings_date?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_otps: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
          used: boolean
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
          used?: boolean
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
          used?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          discount_percent: number
          id: string
          next_renewal_date: string | null
          notes: string | null
          plan: string
          price_ghs: number
          status: string
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_percent?: number
          id?: string
          next_renewal_date?: string | null
          notes?: string | null
          plan?: string
          price_ghs?: number
          status?: string
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_percent?: number
          id?: string
          next_renewal_date?: string | null
          notes?: string | null
          plan?: string
          price_ghs?: number
          status?: string
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      business_has_access: { Args: { _business_id: string }; Returns: boolean }
      create_business_for_owner: {
        Args: {
          _email: string
          _employees: number
          _location: string
          _logo_dark_url: string
          _logo_light_url: string
          _name: string
          _phone: string
        }
        Returns: string
      }
      get_user_business_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_business: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff" | "manager" | "super_admin"
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
    Enums: {
      app_role: ["admin", "staff", "manager", "super_admin"],
    },
  },
} as const

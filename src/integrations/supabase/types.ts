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
      audit_logs: {
        Row: {
          action_type: string
          after_json: Json | null
          before_json: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          after_json?: Json | null
          before_json?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          after_json?: Json | null
          before_json?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      casting_records: {
        Row: {
          abnormality_note: string | null
          casting_code: string
          completed_at: string | null
          completed_by_user_id: string | null
          created_at: string
          discrepancy_flag: boolean
          discrepancy_grams: number | null
          discrepancy_percent: number | null
          extracted_at: string
          extracted_by_user_id: string
          extracted_grams: number
          finished_jewelry_grams: number | null
          has_sprue_transfer: boolean
          id: string
          job_reference: string | null
          last_sprue_transfer_at: string | null
          metal_type_id: string
          notes: string | null
          remaining_unfinalized_balance_grams: number | null
          returned_button_grams: number | null
          source_from_inventory_grams: number
          source_from_open_casting_grams: number
          source_open_casting_id: string | null
          sprue_transfer_notes: string | null
          sprue_transferred_to_next_casting_grams: number
          status: Database["public"]["Enums"]["casting_status"]
          tolerance_percent_used: number | null
          updated_at: string
        }
        Insert: {
          abnormality_note?: string | null
          casting_code: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          discrepancy_flag?: boolean
          discrepancy_grams?: number | null
          discrepancy_percent?: number | null
          extracted_at?: string
          extracted_by_user_id: string
          extracted_grams: number
          finished_jewelry_grams?: number | null
          has_sprue_transfer?: boolean
          id?: string
          job_reference?: string | null
          last_sprue_transfer_at?: string | null
          metal_type_id: string
          notes?: string | null
          remaining_unfinalized_balance_grams?: number | null
          returned_button_grams?: number | null
          source_from_inventory_grams?: number
          source_from_open_casting_grams?: number
          source_open_casting_id?: string | null
          sprue_transfer_notes?: string | null
          sprue_transferred_to_next_casting_grams?: number
          status?: Database["public"]["Enums"]["casting_status"]
          tolerance_percent_used?: number | null
          updated_at?: string
        }
        Update: {
          abnormality_note?: string | null
          casting_code?: string
          completed_at?: string | null
          completed_by_user_id?: string | null
          created_at?: string
          discrepancy_flag?: boolean
          discrepancy_grams?: number | null
          discrepancy_percent?: number | null
          extracted_at?: string
          extracted_by_user_id?: string
          extracted_grams?: number
          finished_jewelry_grams?: number | null
          has_sprue_transfer?: boolean
          id?: string
          job_reference?: string | null
          last_sprue_transfer_at?: string | null
          metal_type_id?: string
          notes?: string | null
          remaining_unfinalized_balance_grams?: number | null
          returned_button_grams?: number | null
          source_from_inventory_grams?: number
          source_from_open_casting_grams?: number
          source_open_casting_id?: string | null
          sprue_transfer_notes?: string | null
          sprue_transferred_to_next_casting_grams?: number
          status?: Database["public"]["Enums"]["casting_status"]
          tolerance_percent_used?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "casting_records_completed_by_user_id_fkey"
            columns: ["completed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casting_records_extracted_by_user_id_fkey"
            columns: ["extracted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casting_records_metal_type_id_fkey"
            columns: ["metal_type_id"]
            isOneToOne: false
            referencedRelation: "metal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casting_records_source_open_casting_id_fkey"
            columns: ["source_open_casting_id"]
            isOneToOne: false
            referencedRelation: "casting_records"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          entered_by_user_id: string
          grams: number
          id: string
          metal_type_id: string
          notes: string | null
          related_casting_id: string | null
          timestamp: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          created_at?: string
          entered_by_user_id: string
          grams: number
          id?: string
          metal_type_id: string
          notes?: string | null
          related_casting_id?: string | null
          timestamp?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          created_at?: string
          entered_by_user_id?: string
          grams?: number
          id?: string
          metal_type_id?: string
          notes?: string | null
          related_casting_id?: string | null
          timestamp?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_metal_type_id_fkey"
            columns: ["metal_type_id"]
            isOneToOne: false
            referencedRelation: "metal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_related_casting_id_fkey"
            columns: ["related_casting_id"]
            isOneToOne: false
            referencedRelation: "casting_records"
            referencedColumns: ["id"]
          },
        ]
      }
      metal_threshold_overrides: {
        Row: {
          id: string
          metal_type_id: string
          minimum_threshold_grams: number
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          id?: string
          metal_type_id: string
          minimum_threshold_grams: number
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          id?: string
          metal_type_id?: string
          minimum_threshold_grams?: number
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metal_threshold_overrides_metal_type_id_fkey"
            columns: ["metal_type_id"]
            isOneToOne: true
            referencedRelation: "metal_types"
            referencedColumns: ["id"]
          },
        ]
      }
      metal_types: {
        Row: {
          active_status: boolean
          color_group: string
          created_at: string
          current_stock_grams: number
          display_order: number
          id: string
          karat_label: string
          low_stock_warning_enabled: boolean
          metal_family: string
          metal_name: string
          minimum_threshold_grams: number
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          color_group?: string
          created_at?: string
          current_stock_grams?: number
          display_order?: number
          id?: string
          karat_label?: string
          low_stock_warning_enabled?: boolean
          metal_family?: string
          metal_name: string
          minimum_threshold_grams?: number
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          color_group?: string
          created_at?: string
          current_stock_grams?: number
          display_order?: number
          id?: string
          karat_label?: string
          low_stock_warning_enabled?: boolean
          metal_family?: string
          metal_name?: string
          minimum_threshold_grams?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_status: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          default_discrepancy_tolerance_percent: number
          enable_discrepancy_warnings: boolean
          enable_low_stock_warnings: boolean
          id: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          default_discrepancy_tolerance_percent?: number
          enable_discrepancy_warnings?: boolean
          enable_low_stock_warnings?: boolean
          id?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          default_discrepancy_tolerance_percent?: number
          enable_discrepancy_warnings?: boolean
          enable_low_stock_warnings?: boolean
          id?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employee"
      casting_status:
        | "extracted_pending_completion"
        | "completed"
        | "flagged"
        | "open_with_sprue_transfer"
      transaction_type:
        | "initial_stock"
        | "add_stock"
        | "extract_for_casting"
        | "return_from_casting"
        | "manual_adjustment"
        | "sprue_transfer_from_open_casting"
        | "transfer_from_open_casting_to_stock"
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
      app_role: ["admin", "employee"],
      casting_status: [
        "extracted_pending_completion",
        "completed",
        "flagged",
        "open_with_sprue_transfer",
      ],
      transaction_type: [
        "initial_stock",
        "add_stock",
        "extract_for_casting",
        "return_from_casting",
        "manual_adjustment",
        "sprue_transfer_from_open_casting",
        "transfer_from_open_casting_to_stock",
      ],
    },
  },
} as const

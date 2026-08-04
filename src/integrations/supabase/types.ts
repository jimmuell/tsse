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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      backtest_jobs: {
        Row: {
          config: Json
          created_at: string
          dataset_id: string | null
          engine_run_id: string | null
          engine_version: string | null
          error: string | null
          id: string
          payload: Json
          range_from: string | null
          range_to: string | null
          run_id: string | null
          source: string
          spec_version: string | null
          status: string
          strategy_id: string
          symbol: string
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dataset_id?: string | null
          engine_run_id?: string | null
          engine_version?: string | null
          error?: string | null
          id?: string
          payload?: Json
          range_from?: string | null
          range_to?: string | null
          run_id?: string | null
          source?: string
          spec_version?: string | null
          status?: string
          strategy_id: string
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          dataset_id?: string | null
          engine_run_id?: string | null
          engine_version?: string | null
          error?: string | null
          id?: string
          payload?: Json
          range_from?: string | null
          range_to?: string | null
          run_id?: string | null
          source?: string
          spec_version?: string | null
          status?: string
          strategy_id?: string
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_jobs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_jobs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_runs: {
        Row: {
          compiled: Json
          config: Json
          created_at: string
          dataset_id: string | null
          dataset_name: string
          equity: Json
          id: string
          stats: Json
          strategy_id: string
          trades: Json
          user_id: string
        }
        Insert: {
          compiled?: Json
          config?: Json
          created_at?: string
          dataset_id?: string | null
          dataset_name?: string
          equity?: Json
          id?: string
          stats?: Json
          strategy_id: string
          trades?: Json
          user_id: string
        }
        Update: {
          compiled?: Json
          config?: Json
          created_at?: string
          dataset_id?: string | null
          dataset_name?: string
          equity?: Json
          id?: string
          stats?: Json
          strategy_id?: string
          trades?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_runs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_runs_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_bars: {
        Row: {
          c: number
          dataset_id: string
          h: number
          l: number
          o: number
          t: number
          v: number
        }
        Insert: {
          c: number
          dataset_id: string
          h: number
          l: number
          o: number
          t: number
          v?: number
        }
        Update: {
          c?: number
          dataset_id?: string
          h?: number
          l?: number
          o?: number
          t?: number
          v?: number
        }
        Relationships: [
          {
            foreignKeyName: "dataset_bars_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          bar_count: number
          bars: Json
          created_at: string
          end_at: string | null
          id: string
          name: string
          start_at: string | null
          storage: string
          symbol: string
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bar_count?: number
          bars?: Json
          created_at?: string
          end_at?: string | null
          id?: string
          name?: string
          start_at?: string | null
          storage?: string
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bar_count?: number
          bars?: Json
          created_at?: string
          end_at?: string | null
          id?: string
          name?: string
          start_at?: string | null
          storage?: string
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          created_at: string
          definition: Json
          id: string
          name: string
          scores: Json
          source_content: string
          source_type: string
          source_url: string | null
          status: string
          updated_at: string
          user_id: string
          wizard_step: number
        }
        Insert: {
          created_at?: string
          definition?: Json
          id?: string
          name?: string
          scores?: Json
          source_content?: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wizard_step?: number
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          name?: string
          scores?: Json
          source_content?: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wizard_step?: number
        }
        Relationships: []
      }
      strategy_questions: {
        Row: {
          answer: string | null
          created_at: string
          explanation: string | null
          id: string
          options: Json
          question: string
          section: string
          status: string
          strategy_id: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question: string
          section?: string
          status?: string
          strategy_id: string
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question?: string
          section?: string
          status?: string
          strategy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_questions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
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

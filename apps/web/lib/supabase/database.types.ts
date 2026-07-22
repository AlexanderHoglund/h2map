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
      country_defaults: {
        Row: {
          capex_pack: Json | null
          grid_ef_tco2_mwh: number | null
          iso2: string
          source: string | null
          updated_at: string
          wacc_suggestion: number | null
        }
        Insert: {
          capex_pack?: Json | null
          grid_ef_tco2_mwh?: number | null
          iso2: string
          source?: string | null
          updated_at?: string
          wacc_suggestion?: number | null
        }
        Update: {
          capex_pack?: Json | null
          grid_ef_tco2_mwh?: number | null
          iso2?: string
          source?: string | null
          updated_at?: string
          wacc_suggestion?: number | null
        }
        Relationships: []
      }
      hex_lcoh: {
        Row: {
          best_pv_mw: number | null
          best_wind_mw: number | null
          computed_at: string
          engine_version: string | null
          h3: string
          lat: number
          lcoh_best: number | null
          lcoh_solar: number | null
          lcoh_wind: number | null
          lon: number
          res: number
          solar_cf: number | null
          status: string
          wind_cf: number | null
        }
        Insert: {
          best_pv_mw?: number | null
          best_wind_mw?: number | null
          computed_at?: string
          engine_version?: string | null
          h3: string
          lat: number
          lcoh_best?: number | null
          lcoh_solar?: number | null
          lcoh_wind?: number | null
          lon: number
          res: number
          solar_cf?: number | null
          status?: string
          wind_cf?: number | null
        }
        Update: {
          best_pv_mw?: number | null
          best_wind_mw?: number | null
          computed_at?: string
          engine_version?: string | null
          h3?: string
          lat?: number
          lcoh_best?: number | null
          lcoh_solar?: number | null
          lcoh_wind?: number | null
          lon?: number
          res?: number
          solar_cf?: number | null
          status?: string
          wind_cf?: number | null
        }
        Relationships: []
      }
      resource_profiles: {
        Row: {
          cf: number[]
          created_at: string
          dataset_version: string
          id: string
          kind: string
          lat_r: number
          lon_r: number
          provider: string
          years: unknown
        }
        Insert: {
          cf: number[]
          created_at?: string
          dataset_version: string
          id?: string
          kind: string
          lat_r: number
          lon_r: number
          provider: string
          years?: unknown
        }
        Update: {
          cf?: number[]
          created_at?: string
          dataset_version?: string
          id?: string
          kind?: string
          lat_r?: number
          lon_r?: number
          provider?: string
          years?: unknown
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          created_at: string
          id: string
          inputs: Json
          name: string
          owner: string | null
          profile_hashes: Json | null
          results: Json | null
          share_token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inputs: Json
          name: string
          owner?: string | null
          profile_hashes?: Json | null
          results?: Json | null
          share_token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inputs?: Json
          name?: string
          owner?: string | null
          profile_hashes?: Json | null
          results?: Json | null
          share_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      turbine_curves: {
        Row: {
          hub_heights: number[]
          id: string
          power_kw: number[]
          rated_kw: number
          source: string | null
          speeds: number[]
        }
        Insert: {
          hub_heights: number[]
          id: string
          power_kw: number[]
          rated_kw: number
          source?: string | null
          speeds: number[]
        }
        Update: {
          hub_heights?: number[]
          id?: string
          power_kw?: number[]
          rated_kw?: number
          source?: string | null
          speeds?: number[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_hex_cells: {
        Args: { p_ids: string[] }
        Returns: {
          best_pv_mw: number | null
          best_wind_mw: number | null
          computed_at: string
          engine_version: string | null
          h3: string
          lat: number
          lcoh_best: number | null
          lcoh_solar: number | null
          lcoh_wind: number | null
          lon: number
          res: number
          solar_cf: number | null
          status: string
          wind_cf: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hex_lcoh"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_scenario_by_share_token: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          id: string
          inputs: Json
          name: string
          owner: string | null
          profile_hashes: Json | null
          results: Json | null
          share_token: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scenarios"
          isOneToOne: false
          isSetofReturn: true
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
  public: {
    Enums: {},
  },
} as const

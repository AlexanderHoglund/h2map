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
      country_defaults: {
        Row: {
          capex_pack: Json | null
          country_risk_premium: number | null
          curated: boolean
          electricity_price_usd_mwh: number | null
          grid_ef_tco2_mwh: number | null
          iso2: string
          labour_index: number | null
          land_cost_usd_ha: number | null
          profile_source: Json | null
          profile_updated_at: string | null
          profile_version: string | null
          source: string | null
          updated_at: string
          wacc_curated: number | null
          wacc_suggestion: number | null
          water_price_usd_m3: number | null
        }
        Insert: {
          capex_pack?: Json | null
          country_risk_premium?: number | null
          curated?: boolean
          electricity_price_usd_mwh?: number | null
          grid_ef_tco2_mwh?: number | null
          iso2: string
          labour_index?: number | null
          land_cost_usd_ha?: number | null
          profile_source?: Json | null
          profile_updated_at?: string | null
          profile_version?: string | null
          source?: string | null
          updated_at?: string
          wacc_curated?: number | null
          wacc_suggestion?: number | null
          water_price_usd_m3?: number | null
        }
        Update: {
          capex_pack?: Json | null
          country_risk_premium?: number | null
          curated?: boolean
          electricity_price_usd_mwh?: number | null
          grid_ef_tco2_mwh?: number | null
          iso2?: string
          labour_index?: number | null
          land_cost_usd_ha?: number | null
          profile_source?: Json | null
          profile_updated_at?: string | null
          profile_version?: string | null
          source?: string | null
          updated_at?: string
          wacc_curated?: number | null
          wacc_suggestion?: number | null
          water_price_usd_m3?: number | null
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
          lcoh_optimal: Json | null
          lcoh_solar: number | null
          lcoh_wacc: Json | null
          lcoh_wind: number | null
          lcoh_years: Json | null
          lon: number
          pv_db_tier: string | null
          res: number
          solar_cf: number | null
          status: string
          wind_cf: number | null
          wind_fidelity: string | null
        }
        Insert: {
          best_pv_mw?: number | null
          best_wind_mw?: number | null
          computed_at?: string
          engine_version?: string | null
          h3: string
          lat: number
          lcoh_best?: number | null
          lcoh_optimal?: Json | null
          lcoh_solar?: number | null
          lcoh_wacc?: Json | null
          lcoh_wind?: number | null
          lcoh_years?: Json | null
          lon: number
          pv_db_tier?: string | null
          res: number
          solar_cf?: number | null
          status?: string
          wind_cf?: number | null
          wind_fidelity?: string | null
        }
        Update: {
          best_pv_mw?: number | null
          best_wind_mw?: number | null
          computed_at?: string
          engine_version?: string | null
          h3?: string
          lat?: number
          lcoh_best?: number | null
          lcoh_optimal?: Json | null
          lcoh_solar?: number | null
          lcoh_wacc?: Json | null
          lcoh_wind?: number | null
          lcoh_years?: Json | null
          lon?: number
          pv_db_tier?: string | null
          res?: number
          solar_cf?: number | null
          status?: string
          wind_cf?: number | null
          wind_fidelity?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_expires_at: string | null
          account_type: string
          created_at: string
          full_name: string
          id: string
          is_admin: boolean
          organisation: string
          projects_seeded_at: string | null
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          account_type?: string
          created_at?: string
          full_name?: string
          id: string
          is_admin?: boolean
          organisation?: string
          projects_seeded_at?: string | null
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          account_type?: string
          created_at?: string
          full_name?: string
          id?: string
          is_admin?: boolean
          organisation?: string
          projects_seeded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ref_bundles: {
        Row: {
          bundle_id: string
          created_at: string
          schema_version: number
          source: Json
        }
        Insert: {
          bundle_id: string
          created_at?: string
          schema_version: number
          source: Json
        }
        Update: {
          bundle_id?: string
          created_at?: string
          schema_version?: number
          source?: Json
        }
        Relationships: []
      }
      ref_countries: {
        Row: {
          bundle_id: string
          id: string
          label: string
          source_note: string
          verified: boolean
          wacc: number
        }
        Insert: {
          bundle_id: string
          id: string
          label: string
          source_note: string
          verified: boolean
          wacc: number
        }
        Update: {
          bundle_id?: string
          id?: string
          label?: string
          source_note?: string
          verified?: boolean
          wacc?: number
        }
        Relationships: [
          {
            foreignKeyName: "ref_countries_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "ref_bundles"
            referencedColumns: ["bundle_id"]
          },
        ]
      }
      ref_fuels: {
        Row: {
          barge_capex_usd_m: number
          barge_opex_usd_m_per_year: number
          bundle_id: string
          combustion_ef_tco2_per_tonne: number
          id: string
          label: string
          lhv_mj_per_tonne: number
          port_storage_capex_usd_m: number
          port_storage_opex_usd_m_per_year: number
          price_usd_per_tonne: number
          prod_capex_usd_m: number
          prod_opex_usd_m_per_year: number
          source_note: string
          verified: boolean
          vessel_capex_premium: number
          wtw_gco2_per_mj: number
        }
        Insert: {
          barge_capex_usd_m: number
          barge_opex_usd_m_per_year: number
          bundle_id: string
          combustion_ef_tco2_per_tonne: number
          id: string
          label: string
          lhv_mj_per_tonne: number
          port_storage_capex_usd_m: number
          port_storage_opex_usd_m_per_year: number
          price_usd_per_tonne: number
          prod_capex_usd_m: number
          prod_opex_usd_m_per_year: number
          source_note: string
          verified: boolean
          vessel_capex_premium: number
          wtw_gco2_per_mj: number
        }
        Update: {
          barge_capex_usd_m?: number
          barge_opex_usd_m_per_year?: number
          bundle_id?: string
          combustion_ef_tco2_per_tonne?: number
          id?: string
          label?: string
          lhv_mj_per_tonne?: number
          port_storage_capex_usd_m?: number
          port_storage_opex_usd_m_per_year?: number
          price_usd_per_tonne?: number
          prod_capex_usd_m?: number
          prod_opex_usd_m_per_year?: number
          source_note?: string
          verified?: boolean
          vessel_capex_premium?: number
          wtw_gco2_per_mj?: number
        }
        Relationships: [
          {
            foreignKeyName: "ref_fuels_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "ref_bundles"
            referencedColumns: ["bundle_id"]
          },
        ]
      }
      ref_regulation_schedules: {
        Row: {
          bundle_id: string
          from_calendar_year: number
          schedule_id: string
          value: number
        }
        Insert: {
          bundle_id: string
          from_calendar_year: number
          schedule_id: string
          value: number
        }
        Update: {
          bundle_id?: string
          from_calendar_year?: number
          schedule_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "ref_regulation_schedules_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "ref_bundles"
            referencedColumns: ["bundle_id"]
          },
        ]
      }
      ref_vessel_types: {
        Row: {
          bundle_id: string
          capex_usd_m: number
          fuel_tonnes_per_year: number
          gj_per_nm: number
          id: string
          label: string
          opex_usd_m_per_year: number
          source_note: string
          verified: boolean
        }
        Insert: {
          bundle_id: string
          capex_usd_m: number
          fuel_tonnes_per_year: number
          gj_per_nm: number
          id: string
          label: string
          opex_usd_m_per_year: number
          source_note: string
          verified: boolean
        }
        Update: {
          bundle_id?: string
          capex_usd_m?: number
          fuel_tonnes_per_year?: number
          gj_per_nm?: number
          id?: string
          label?: string
          opex_usd_m_per_year?: number
          source_note?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ref_vessel_types_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "ref_bundles"
            referencedColumns: ["bundle_id"]
          },
        ]
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
          mode: string
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
          mode?: string
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
          mode?: string
          provider?: string
          years?: unknown
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          created_at: string
          engine_version: string | null
          id: string
          inputs: Json
          kind: string
          name: string
          owner: string | null
          profile_hashes: Json | null
          ref_bundle_version: string | null
          results: Json | null
          schema_version: number | null
          share_token: string | null
          updated_at: string
          view_mode: string | null
        }
        Insert: {
          created_at?: string
          engine_version?: string | null
          id?: string
          inputs: Json
          kind?: string
          name: string
          owner?: string | null
          profile_hashes?: Json | null
          ref_bundle_version?: string | null
          results?: Json | null
          schema_version?: number | null
          share_token?: string | null
          updated_at?: string
          view_mode?: string | null
        }
        Update: {
          created_at?: string
          engine_version?: string | null
          id?: string
          inputs?: Json
          kind?: string
          name?: string
          owner?: string | null
          profile_hashes?: Json | null
          ref_bundle_version?: string | null
          results?: Json | null
          schema_version?: number | null
          share_token?: string | null
          updated_at?: string
          view_mode?: string | null
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
          lcoh_optimal: Json | null
          lcoh_solar: number | null
          lcoh_wacc: Json | null
          lcoh_wind: number | null
          lcoh_years: Json | null
          lon: number
          pv_db_tier: string | null
          res: number
          solar_cf: number | null
          status: string
          wind_cf: number | null
          wind_fidelity: string | null
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
          engine_version: string | null
          id: string
          inputs: Json
          kind: string
          name: string
          owner: string | null
          profile_hashes: Json | null
          ref_bundle_version: string | null
          results: Json | null
          schema_version: number | null
          share_token: string | null
          updated_at: string
          view_mode: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "scenarios"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
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

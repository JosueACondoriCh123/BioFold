export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string;
          active_pdb_id: string | null;
          snapshot: Json;
          revision: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string;
          active_pdb_id?: string | null;
          snapshot?: Json;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string;
          active_pdb_id?: string | null;
          snapshot?: Json;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_events: {
        Row: {
          id: string;
          project_id: string;
          activity_id: string;
          command: string;
          origin: string;
          agent_kind: string | null;
          approved_by_user: boolean | null;
          source_message_id: string | null;
          status: string;
          evidence: string;
          provenance: Json | null;
          input: Json;
          output: Json | null;
          error: Json | null;
          duration_ms: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          activity_id: string;
          command: string;
          origin: string;
          agent_kind?: string | null;
          approved_by_user?: boolean | null;
          source_message_id?: string | null;
          status: string;
          evidence: string;
          provenance?: Json | null;
          input: Json;
          output?: Json | null;
          error?: Json | null;
          duration_ms?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          activity_id?: string;
          command?: string;
          origin?: string;
          agent_kind?: string | null;
          approved_by_user?: boolean | null;
          source_message_id?: string | null;
          status?: string;
          evidence?: string;
          provenance?: Json | null;
          input?: Json;
          output?: Json | null;
          error?: Json | null;
          duration_ms?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          request_id: string | null;
          sender: string;
          content: string;
          citations: Json | null;
          proposals: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          request_id?: string | null;
          sender: string;
          content: string;
          citations?: Json | null;
          proposals?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          request_id?: string | null;
          sender?: string;
          content?: string;
          citations?: Json | null;
          proposals?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_requests: {
        Row: {
          id: string;
          project_id: string;
          conversation_id: string | null;
          user_id: string;
          request_id: string;
          model: string;
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          cost_usd: number | null;
          duration_ms: number | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          conversation_id?: string | null;
          user_id: string;
          request_id: string;
          model: string;
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost_usd?: number | null;
          duration_ms?: number | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          conversation_id?: string | null;
          user_id?: string;
          request_id?: string;
          model?: string;
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost_usd?: number | null;
          duration_ms?: number | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_requests_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_requests_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      structure_metadata: {
        Row: {
          pdb_id: string;
          title: string | null;
          deposition_date: string | null;
          release_date: string | null;
          experimental_method: string | null;
          resolution: number | null;
          chains: Json | null;
          summary: Json | null;
          cached_at: string;
          expires_at: string;
        };
        Insert: {
          pdb_id: string;
          title?: string | null;
          deposition_date?: string | null;
          release_date?: string | null;
          experimental_method?: string | null;
          resolution?: number | null;
          chains?: Json | null;
          summary?: Json | null;
          cached_at?: string;
          expires_at?: string;
        };
        Update: {
          pdb_id?: string;
          title?: string | null;
          deposition_date?: string | null;
          release_date?: string | null;
          experimental_method?: string | null;
          resolution?: number | null;
          chains?: Json | null;
          summary?: Json | null;
          cached_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      knowledge_sources: {
        Row: {
          id: string;
          title: string;
          publisher: string;
          url: string;
          license: string;
          retrieved_at: string;
          content_path: string | null;
          sha256: string;
          created_at: string;
        };
        Insert: {
          id: string;
          title: string;
          publisher: string;
          url: string;
          license: string;
          retrieved_at: string;
          content_path?: string | null;
          sha256: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          publisher?: string;
          url?: string;
          license?: string;
          retrieved_at?: string;
          content_path?: string | null;
          sha256?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      knowledge_chunks: {
        Row: {
          id: string;
          source_id: string;
          chunk_index: number;
          title: string;
          content: string;
          locator: string | null;
          token_count: number | null;
          embedding: string | null;
          fts: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          chunk_index: number;
          title: string;
          content: string;
          locator?: string | null;
          token_count?: number | null;
          embedding?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          chunk_index?: number;
          title?: string;
          content?: string;
          locator?: string | null;
          token_count?: number | null;
          embedding?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_sources";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      hybrid_search_knowledge: {
        Args: {
          query_text: string;
          query_embedding?: string | null;
          match_count?: number;
          full_text_weight?: number;
          semantic_weight?: number;
          rrf_k?: number;
        };
        Returns: Array<{
          chunk_id: string;
          source_id: string;
          title: string;
          content: string;
          locator: string | null;
          publisher: string;
          url: string;
          retrieved_at: string;
          score: number;
        }>;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

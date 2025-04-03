import { supabase } from '@/lib/supabase';

export interface VapiAssistant {
  id: string;
  name: string;
  assistant_id?: string;
  user_id?: string;
  status?: string;
  created_at?: string;
  system_prompt?: string;
  first_message?: string;
}

export interface WebhookPayload {
  action: string;
  campaign_id: number;
  client_id?: number;
  client_name?: string;
  client_phone?: string;
  user_id?: string;
  additional_data?: Record<string, any>;
}

export interface WebhookData {
  action: string;
  campaign_id?: number;
  client_name?: string;
  client_phone?: string;
  timestamp?: string;
  additional_data?: Record<string, any>;
}

interface WebhookResponse {
  success: boolean;
  message?: string;
  data?: any;
}

interface AssistantCreationParams {
  assistant_name: string;
  first_message: string;
  system_prompt: string;
}

// Vapi API key - updated with the provided public key
const VAPI_API_KEY = "494da5a9-4a54-4155-bffb-d7206bd72afd";
const VAPI_API_URL = "https://api.vapi.ai";

export const webhookService = {
  // Webhook para criar assistente virtual
  async createAssistant(params: AssistantCreationParams): Promise<WebhookResponse> {
    try {
      console.log('Criando assistente com parâmetros:', params);

      // Usando os campos corretos que a API da Vapi espera
      const response = await fetch(`${VAPI_API_URL}/assistant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: params.assistant_name,
          prompt: params.system_prompt,
          first_message: params.first_message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Resposta de erro da Vapi:', errorText);
        throw new Error(`Erro ao criar assistente: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Assistente criado com sucesso via API da Vapi:', data);

      let userId = null;
      let assistantData = null;

      // Se o assistente foi criado com sucesso, vamos salvá-lo no banco de dados
      if (data && data.id) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          userId = authData?.session?.user?.id;

          const { data: dbAssistantData, error: dbError } = await supabase
            .from('assistants')
            .insert({
              name: params.assistant_name,
              assistant_id: data.id,
              system_prompt: params.system_prompt,
              first_message: params.first_message,
              user_id: userId,
              status: 'ready',
            })
            .select()
            .single();

          if (dbError) {
            console.error('Erro ao salvar assistente no banco de dados:', dbError);
          } else {
            console.log('Assistente salvo no banco de dados:', dbAssistantData);
            localStorage.setItem('selected_assistant', JSON.stringify(dbAssistantData));
            assistantData = dbAssistantData;
          }
        } catch (dbSaveError) {
          console.error('Erro ao salvar assistente no banco de dados:', dbSaveError);
        }
        
        // Notificar webhook externo sobre a criação do assistente
        try {
          await this.notifyAssistantCreation({
            assistant_id: data.id,
            assistant_name: params.assistant_name,
            system_prompt: params.system_prompt,
            first_message: params.first_message,
            user_id: userId,
            vapi_data: data
          });
        } catch (webhookError) {
          console.error('Erro ao notificar webhook sobre criação do assistente:', webhookError);
          // Não interromper o fluxo caso o webhook falhe
        }
      }

      return {
        success: true,
        message: 'Assistente criado com sucesso',
        data,
      };
    } catch (error) {
      console.error('Erro ao criar assistente:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
  
  // Nova função para enviar os dados do assistente para o webhook externo
  async notifyAssistantCreation(assistantData: {
    assistant_id: string;
    assistant_name: string;
    system_prompt: string;
    first_message: string;
    user_id?: string;
    vapi_data?: any;
  }): Promise<void> {
    try {
      console.log('Notificando webhook sobre criação de assistente:', assistantData);
      
      const response = await fetch('https://primary-production-31de.up.railway.app/webhook/createassistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'assistant_created',
          timestamp: new Date().toISOString(),
          assistant_id: assistantData.assistant_id,
          assistant_name: assistantData.assistant_name,
          system_prompt: assistantData.system_prompt,
          first_message: assistantData.first_message,
          user_id: assistantData.user_id,
          vapi_data: assistantData.vapi_data
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erro ao notificar webhook externo:', errorText);
        throw new Error(`Falha ao notificar webhook: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Webhook notificado com sucesso:', data);
    } catch (error) {
      console.error('Erro ao notificar webhook sobre criação do assistente:', error);
      throw error;
    }
  },

  async getAllAssistants(userId?: string): Promise<VapiAssistant[]> {
    try {
      console.log('Buscando assistentes diretamente da Vapi para o usuário:', userId);

      // Usando o endpoint correto para listar assistentes
      const response = await fetch(`${VAPI_API_URL}/assistant`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erro ao buscar assistentes da Vapi:', errorText);
        throw new Error(`Erro ao buscar assistentes: ${response.statusText} - ${errorText}`);
      }

      const assistantsData = await response.json();
      console.log('Todos os assistentes recuperados da Vapi:', assistantsData);

      const assistants: VapiAssistant[] = assistantsData.map((assistant: any) => ({
        id: assistant.id,
        name: assistant.name || 'Assistente sem nome',
        assistant_id: assistant.id,
        user_id: userId,
        status: assistant.status || 'ready',
        created_at: assistant.created_at || new Date().toISOString(),
        system_prompt: assistant.prompt || assistant.system_prompt,
        first_message: assistant.first_message || assistant.firstMessage,
      }));

      console.log(`Encontrados ${assistants.length} assistentes da Vapi`);
      return assistants;
    } catch (error) {
      console.error('Erro ao buscar assistentes da Vapi:', error);

      console.log('Tentando buscar do banco de dados local como fallback');
      try {
        const { data, error } = await supabase
          .from('assistants')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Erro ao buscar assistentes do banco local:', error);
          return [];
        }

        console.log(`Encontrados ${data?.length || 0} assistentes no banco local:`, data);
        return data || [];
      } catch (dbError) {
        console.error('Erro ao buscar assistentes do banco local:', dbError);
        return [];
      }
    }
  },

  // Webhook para fazer a ligação
  async makeCall(clientId: number, phoneNumber: string, campaignId: number): Promise<WebhookResponse> {
    try {
      console.log(`Iniciando chamada para cliente ${clientId} - ${phoneNumber} - campanha ${campaignId}`);
      
      // Get selected assistant from localStorage
      let selectedAssistant = null;
      try {
        const storedAssistant = localStorage.getItem('selected_assistant');
        if (storedAssistant) {
          selectedAssistant = JSON.parse(storedAssistant);
          console.log('Using stored assistant for call:', selectedAssistant);
        }
      } catch (e) {
        console.error('Error parsing stored assistant data:', e);
      }
      
      const response = await fetch('https://primary-production-31de.up.railway.app/webhook/collowop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          phoneNumber,
          campaignId,
          assistant_id: selectedAssistant?.assistant_id,
          assistant_name: selectedAssistant?.name
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao fazer ligação: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return {
        success: true,
        message: 'Ligação iniciada com sucesso',
        data,
      };
    } catch (error) {
      console.error('Erro ao fazer ligação:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
  
  // Recuperar assistentes da Vapi
  async getAssistantsFromVapi(): Promise<WebhookResponse> {
    try {
      console.log('Buscando assistentes da Vapi');
      
      // Get assistants from our database
      const { data, error } = await supabase
        .from('assistants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar assistentes do banco de dados:', error);
        return {
          success: false,
          message: error.message
        };
      }
      
      console.log('Assistentes recuperados do banco de dados:', data);
      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      console.error('Erro ao buscar assistentes da Vapi:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
  
  // Acionar webhook com payload customizado
  async triggerCallWebhook(payload: WebhookPayload): Promise<WebhookResponse> {
    try {
      console.log('Enviando payload para webhook:', payload);
      
      // Get selected assistant from localStorage if available
      try {
        const storedAssistant = localStorage.getItem('selected_assistant');
        if (storedAssistant) {
          const assistantData = JSON.parse(storedAssistant);
          // Append selected assistant data to additional_data if not already present
          if (!payload.additional_data) {
            payload.additional_data = {};
          }
          payload.additional_data.assistant_id = assistantData.assistant_id;
          payload.additional_data.assistant_name = assistantData.name;
          console.log('Added selected assistant data to webhook payload:', assistantData);
        }
      } catch (e) {
        console.error('Error parsing stored assistant data:', e);
      }
      
      const response = await fetch('https://primary-production-31de.up.railway.app/webhook/collowop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao acionar webhook: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Resposta do webhook:', data);
      
      return {
        success: true,
        message: 'Webhook acionado com sucesso',
        data,
      };
    } catch (error) {
      console.error('Erro ao acionar webhook:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
  
  // Preparar chamadas em massa para uma campanha
  async prepareBulkCallsForCampaign(campaignId: number, clientIds: number[]): Promise<WebhookResponse> {
    try {
      console.log(`Preparando chamadas em massa para campanha ${campaignId} com ${clientIds.length} clientes`);
      
      // Get selected assistant from localStorage
      let selectedAssistant = null;
      try {
        const storedAssistant = localStorage.getItem('selected_assistant');
        if (storedAssistant) {
          selectedAssistant = JSON.parse(storedAssistant);
          console.log('Using selected assistant for bulk calls:', selectedAssistant);
        }
      } catch (e) {
        console.error('Error parsing stored assistant data:', e);
      }
      
      // For demonstration, returning a simulated response
      return {
        success: true,
        message: `Preparação para ${clientIds.length} chamadas iniciada com sucesso`,
        data: {
          campaign_id: campaignId,
          calls_scheduled: clientIds.length,
          estimated_start_time: new Date().toISOString(),
          assistant_id: selectedAssistant?.assistant_id,
          assistant_name: selectedAssistant?.name
        }
      };
    } catch (error) {
      console.error('Erro ao preparar chamadas em massa:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }
};

export default webhookService;
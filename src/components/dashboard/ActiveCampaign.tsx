import React from 'react';
import { Link } from 'react-router-dom';
import { PhoneOff, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { webhookService } from '@/services/webhookService';
import { useAuth } from '@/contexts/AuthContext';
import assistantService from '@/services/assistantService';

interface CampaignStatus {
  id: number;
  name: string;
  progress: number;
  startTime: string;
  callsMade: number;
  callsRemaining: number;
  active: boolean;
  assistantName?: string;
  assistantId?: string;
  vapiAssistantId?: string;  // Explicit field for Vapi assistant ID
}

interface ActiveCampaignProps {
  campaign: CampaignStatus;
  onCampaignStopped?: () => void;
}

const ActiveCampaign: React.FC<ActiveCampaignProps> = ({ campaign, onCampaignStopped }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isStoppingCampaign, setIsStoppingCampaign] = React.useState(false);

  const formatAssistantId = (id?: string) => {
    if (!id) return '';
    // Format the ID to show just the first part like in the screenshot
    return id.length > 12 ? `${id.slice(0, 12)}...` : id;
  };

  const handleStopCampaign = async () => {
    if (!campaign.id) {
      toast.error("ID da campanha não encontrado. Não é possível interromper a campanha.");
      return;
    }

    try {
      setIsStoppingCampaign(true);
      
      // Get assistant name
      const assistantName = campaign.assistantName;
      let vapiAssistantId = null;
      
      // Get Vapi assistant ID by name if available
      if (assistantName) {
        try {
          console.log('Buscando ID do assistente pelo nome:', assistantName);
          vapiAssistantId = await assistantService.getVapiAssistantIdByName(assistantName);
          
          if (vapiAssistantId) {
            console.log('ID Vapi encontrado pelo nome do assistente:', vapiAssistantId);
          } else {
            console.warn('Nenhum assistente encontrado com o nome:', assistantName);
          }
        } catch (e) {
          console.error('Erro ao buscar assistente pelo nome:', e);
        }
      }
      
      // If still no Vapi ID, use the existing IDs
      if (!vapiAssistantId) {
        // Get the Supabase assistant ID (from the assistantId field)
        let supabaseAssistantId = campaign.assistantId;
        // Get the Vapi assistant ID (from the vapiAssistantId field)
        vapiAssistantId = campaign.vapiAssistantId;
        
        console.log('IDs de assistente para interrupção de campanha:', {
          supabaseAssistantId,
          vapiAssistantId
        });
        
        // If we have a Supabase ID but no Vapi ID, try to get Vapi ID
        if (supabaseAssistantId && !vapiAssistantId) {
          try {
            vapiAssistantId = await assistantService.ensureVapiAssistantId(supabaseAssistantId);
            console.log('ID Vapi obtido a partir do ID do Supabase:', vapiAssistantId);
          } catch (e) {
            console.error('Erro ao confirmar ID Vapi:', e);
          }
        }
      }
      
      // Last resort - Get all assistants and use the first one
      if (!vapiAssistantId) {
        try {
          console.log('Tentando obter lista de assistentes da API Vapi');
          const vapiAssistants = await webhookService.getAssistantsFromVapiApi();
          if (vapiAssistants && vapiAssistants.length > 0) {
            vapiAssistantId = vapiAssistants[0].id;
            console.log('Usando primeiro assistente da API Vapi:', vapiAssistantId);
          }
        } catch (e) {
          console.error('Erro ao buscar assistentes da API Vapi:', e);
        }
      }

      console.log('ID final do assistente para a campanha:', vapiAssistantId);
      
      // Send data to webhook with both IDs
      const result = await webhookService.triggerCallWebhook({
        action: 'stop_campaign',
        campaign_id: campaign.id,
        user_id: user?.id,
        additional_data: {
          campaign_name: campaign.name,
          progress: campaign.progress,
          completed_calls: campaign.callsMade,
          assistant_id: campaign.assistantId, // ID do Supabase (banco)
          vapi_assistant_id: vapiAssistantId, // ID da Vapi (API externa)
          assistant_name: campaign.assistantName
        }
      });
      
      if (result.success) {
        if (onCampaignStopped) {
          onCampaignStopped();
        }
        
        // Invalidate queries to force data reload
        queryClient.invalidateQueries({ queryKey: ['activeCampaigns'] });
        queryClient.invalidateQueries({ queryKey: ['campaignStats'] });
        
        toast.success("Campanha interrompida com sucesso");
      } else {
        // Even if the webhook call fails, we still want to allow the user to stop the campaign
        // since we already showed an error message in the webhook service
        if (onCampaignStopped) {
          onCampaignStopped();
        }
        queryClient.invalidateQueries({ queryKey: ['activeCampaigns'] });
        toast.warning("A campanha foi marcada como interrompida, mas houve um problema na comunicação com o servidor.");
      }
    } catch (error) {
      console.error('Erro ao interromper campanha:', error);
      toast.error("Erro ao interromper a campanha. Por favor, tente novamente.");
      
      // Even on error, allow the campaign to be stopped in the UI
      if (onCampaignStopped) {
        onCampaignStopped();
      }
    } finally {
      setIsStoppingCampaign(false);
    }
  };

  return (
    <Card className="mb-8 border-2 border-secondary/30 shadow-md">
      <CardHeader className="pb-2 bg-secondary/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center">
              <div className="h-3 w-3 rounded-full bg-secondary animate-pulse mr-2"></div>
              Campanha Ativa: {campaign.name}
            </CardTitle>
            <p className="text-sm text-foreground/70">
              Iniciada às {campaign.startTime} • Assistente: {campaign.assistantName || 'N/A'}
              {campaign.assistantId && (
                <span className="text-xs text-muted-foreground ml-1">
                  (ID Supabase: {formatAssistantId(campaign.assistantId)})
                  {campaign.vapiAssistantId && ` | ID Vapi: ${formatAssistantId(campaign.vapiAssistantId)}`}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="flex items-center gap-1"
              onClick={handleStopCampaign}
              disabled={isStoppingCampaign}
            >
              {isStoppingCampaign ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Interrompendo...</span>
                </>
              ) : (
                <>
                  <PhoneOff size={16} />
                  <span>Interromper Campanha</span>
                </>
              )}
            </Button>
            <Link to="/campaigns">
              <Button size="sm" className="flex items-center gap-1">
                <BarChart3 size={16} />
                <span>Ver Detalhes</span>
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="w-full h-3 bg-gray-200 rounded-full mt-2">
          <div 
            className="h-full bg-secondary rounded-full transition-all duration-500 ease-in-out"
            style={{ width: `${campaign.progress}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-3 text-sm text-foreground/70">
          <span className="font-medium">{campaign.callsMade} ligações realizadas</span>
          <span className="font-medium">{campaign.callsRemaining} ligações restantes</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActiveCampaign;
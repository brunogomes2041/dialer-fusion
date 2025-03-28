import React, { useState, useEffect } from 'react';
import {
  PauseCircle,
  StopCircle,
  Users,
  Settings,
  Save,
  BarChart3,
  Calendar,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardFooter 
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WorkflowStatus from '@/components/WorkflowStatus';
import { webhookService, VapiAssistant } from '@/services/webhookService';
import { campaignService } from '@/services/campaignService';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import assistantService from '@/services/assistantService';

const CampaignControls = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    clientGroup: '',
    aiProfile: '',
  });
  
  const { toast } = useToast();
  
  // Estado para controlar os assistentes personalizados
  const [selectedAssistant, setSelectedAssistant] = useState<VapiAssistant | null>(null);
  
  // Add a query to fetch campaigns
  const { data: supabaseCampaignsData, refetch: refetchCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      return await campaignService.getCampaigns();
    }
  });
  
  // Fetch assistants from the database
  const { data: customAssistants = [], refetch: refetchAssistants } = useQuery({
    queryKey: ['assistants'],
    queryFn: webhookService.getAllAssistants
  });
  
  // Carregar assistentes personalizados
  useEffect(() => {
    if (customAssistants.length > 0) {
      // Verificar se há um assistente selecionado no localStorage
      try {
        const storedAssistant = localStorage.getItem('selected_assistant');
        if (storedAssistant) {
          const assistant = JSON.parse(storedAssistant);
          setSelectedAssistant(assistant);
        } else if (customAssistants.length > 0) {
          // Selecionar o primeiro assistente por padrão
          setSelectedAssistant(customAssistants[0]);
          localStorage.setItem('selected_assistant', JSON.stringify(customAssistants[0]));
        }
      } catch (error) {
        console.error('Error loading selected assistant:', error);
      }
    }
  }, [customAssistants]);
  
  // Fetch real client groups from supabase but without using group()
  const { data: clientGroups = [], isLoading: isLoadingGroups } = useQuery({
    queryKey: ['clientGroups'],
    queryFn: async () => {
      try {
        // Get total count
        const { count: totalCount } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true });
        
        // Get counts by status - we need to fetch all clients and count manually
        const { data: clientsData } = await supabase
          .from('clients')
          .select('status');
        
        // Count clients by status manually
        const statusCounts = {};
        if (clientsData) {
          clientsData.forEach(client => {
            const status = client.status || 'undefined';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
          });
        }
        
        // Format for UI
        const formattedGroups = [
          { id: 'all', name: 'All Clients', count: totalCount || 0 }
        ];
        
        // Add status groups
        Object.keys(statusCounts).forEach(status => {
          formattedGroups.push({
            id: status,
            name: `${status} Clients`,
            count: statusCounts[status]
          });
        });
        
        return formattedGroups;
      } catch (error) {
        console.error('Error fetching client groups:', error);
        return [
          { id: 'all', name: 'All Clients', count: 0 }
        ];
      }
    }
  });
  
  // Using custom assistants instead of fixed profiles
  const { data: aiProfiles = [] } = useQuery({
    queryKey: ['aiProfiles', customAssistants.length],
    queryFn: () => {
      return customAssistants.map(assistant => ({
        id: assistant.id,
        name: assistant.name,
        description: `Assistant created on ${assistant.date ? new Date(assistant.date).toLocaleDateString() : 'unknown date'}`
      }));
    }
  });
  
  useEffect(() => {
    if (supabaseCampaignsData) {
      const formattedCampaigns = supabaseCampaignsData.map(campaign => ({
        id: campaign.id,
        name: campaign.name || 'Untitled Campaign',
        status: campaign.status || 'draft',
        progress: campaign.total_calls > 0 
          ? Math.round((campaign.answered_calls / campaign.total_calls) * 100) 
          : 0,
        clientGroup: 'Active Clients',
        clientCount: campaign.total_calls || 0,
        completedCalls: campaign.answered_calls || 0,
        aiProfile: 'Sales Assistant',
        startDate: campaign.start_date 
          ? new Date(campaign.start_date).toLocaleDateString() 
          : new Date().toLocaleDateString()
      }));
      
      setCampaigns(formattedCampaigns);
      setIsLoading(false);
    }
  }, [supabaseCampaignsData]);
  
  const handleStartCampaign = async (id: number) => {
    try {
      setCampaigns(campaigns.map(campaign => 
        campaign.id === id ? { ...campaign, status: 'active' } : campaign
      ));
      
      const campaign = campaigns.find(c => c.id === id);
      
      if (campaign) {
        await campaignService.updateCampaign(id, {
          status: 'active',
          start_date: new Date().toISOString()
        });
        
        // Determinar qual assistente de IA usar
        const assistantProfile = aiProfiles.find(profile => profile.id.toString() === campaign.aiProfile);
        let vapiAssistantId = '';
        
        if (assistantProfile) {
          vapiAssistantId = assistantProfile.id;
          // Também seleciona o assistente para uso geral
          webhookService.selectAssistant(vapiAssistantId);
        } else if (selectedAssistant) {
          vapiAssistantId = selectedAssistant.id;
        }
        
        await webhookService.triggerCallWebhook({
          action: 'start_campaign',
          campaign_id: campaign.id,
          additional_data: {
            campaign_name: campaign.name,
            client_count: campaign.clientCount,
            ai_profile: assistantProfile ? assistantProfile.name : 'Default Assistant',
            vapi_caller_id: "97141b30-c5bc-4234-babb-d38b79452e2a",
            vapi_assistant_id: vapiAssistantId
          }
        });
        
        // Buscar os dados de todos os clientes para esta campanha
        const result = await webhookService.prepareBulkCallsForCampaign(campaign.id);
        
        if (result.success) {
          toast({
            title: "Campanha Iniciada",
            description: `${result.successfulCalls} ligações foram enviadas com sucesso (${result.failedCalls} falhas).`,
          });
        } else {
          toast({
            title: "Campanha Iniciada Parcialmente",
            description: "Alguns clientes não puderam ser contactados. Verifique os logs.",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Erro ao iniciar campanha:', error);
      
      toast({
        title: "Erro",
        description: "Falha ao iniciar a campanha. Por favor, tente novamente.",
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteCampaign = async (id: number) => {
    try {
      setCampaigns(campaigns.filter(campaign => campaign.id !== id));
      
      await campaignService.deleteCampaign(id);
      
      toast({
        title: "Campanha Excluída",
        description: "A campanha foi excluída com sucesso.",
      });
      
      refetchCampaigns();
    } catch (error) {
      console.error('Erro ao excluir campanha:', error);
      
      toast({
        title: "Erro ao Excluir",
        description: "Houve um problema ao excluir a campanha. Por favor, tente novamente.",
        variant: "destructive"
      });
      
      refetchCampaigns();
    }
  };
  
  const handlePauseCampaign = async (id: number) => {
    setCampaigns(campaigns.map(campaign => 
      campaign.id === id ? { ...campaign, status: 'paused' } : campaign
    ));
    
    const campaign = campaigns.find(c => c.id === id);
    
    if (campaign) {
      try {
        await webhookService.triggerCallWebhook({
          action: 'pause_campaign',
          campaign_id: campaign.id,
          additional_data: {
            campaign_name: campaign.name,
            progress: campaign.progress
          }
        });
        
        toast({
          title: "Campanha Pausada",
          description: "Sua campanha de ligações foi pausada. Você pode retomá-la a qualquer momento.",
        });
      } catch (error) {
        console.error('Erro ao notificar sistema de ligações:', error);
        
        toast({
          title: "Campanha Pausada",
          description: "Campanha pausada, mas houve um erro ao notificar o sistema de ligações.",
          variant: "destructive"
        });
      }
    }
  };
  
  const handleStopCampaign = async (id: number) => {
    setCampaigns(campaigns.map(campaign => 
      campaign.id === id ? { ...campaign, status: 'stopped' } : campaign
    ));
    
    const campaign = campaigns.find(c => c.id === id);
    
    if (campaign) {
      try {
        await webhookService.triggerCallWebhook({
          action: 'stop_campaign',
          campaign_id: campaign.id,
          additional_data: {
            campaign_name: campaign.name,
            progress: campaign.progress,
            completed_calls: campaign.completedCalls
          }
        });
        
        toast({
          title: "Campanha Interrompida",
          description: "Sua campanha de ligações foi interrompida.",
        });
      } catch (error) {
        console.error('Erro ao notificar sistema de ligações:', error);
        
        toast({
          title: "Campanha Interrompida",
          description: "Campanha interrompida, mas houve um erro ao notificar o sistema de ligações.",
          variant: "destructive"
        });
      }
    }
  };
  
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newCampaign.name || !newCampaign.clientGroup || !newCampaign.aiProfile) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    const selectedGroup = clientGroups.find(group => group.id.toString() === newCampaign.clientGroup);
    const clientCount = selectedGroup ? selectedGroup.count : 0;
    
    // Seleciona o assistente IA e obtém seus detalhes
    const selectedAssistant = aiProfiles.find(profile => profile.id.toString() === newCampaign.aiProfile);
    
    if (selectedAssistant) {
      // Salva o assistente selecionado para uso posterior
      webhookService.selectAssistant(selectedAssistant.id);
    }
    
    try {
      const createdCampaign = await campaignService.createCampaign({
        name: newCampaign.name,
        status: 'draft',
        total_calls: clientCount,
        answered_calls: 0,
        start_date: null,
        end_date: null
      });
      
      await webhookService.triggerCallWebhook({
        action: 'create_campaign',
        campaign_id: createdCampaign.id,
        additional_data: {
          campaign_name: createdCampaign.name,
          client_count: clientCount,
          ai_profile: selectedAssistant ? selectedAssistant.name : 'Default Assistant',
          client_group: selectedGroup?.name,
          vapi_caller_id: "97141b30-c5bc-4234-babb-d38b79452e2a",
          vapi_assistant_id: selectedAssistant ? selectedAssistant.id : undefined
        }
      });
      
      toast({
        title: "Campanha Criada",
        description: "Sua nova campanha está pronta para iniciar.",
      });
      
      setNewCampaign({
        name: '',
        clientGroup: '',
        aiProfile: '',
      });
      
      // Recarregar campanhas
      await refetchCampaigns();
    } catch (error) {
      console.error('Erro ao criar campanha:', error);
      
      toast({
        title: "Erro ao Criar Campanha",
        description: "Houve um problema ao criar sua campanha. Por favor, tente novamente.",
        variant: "destructive"
      });
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-secondary text-white';
      case 'paused':
        return 'bg-yellow-500/80 text-white';
      case 'completed':
        return 'bg-blue-500/80 text-white';
      case 'stopped':
        return 'bg-destructive/80 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };
  
  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Suas Campanhas</h2>
            <Button size="sm" onClick={() => refetchAssistants()}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Atualizar Assistentes
            </Button>
          </div>
          
          <WorkflowStatus />
          
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Carregando campanhas...</p>
                </div>
              </CardContent>
            </Card>
          ) : campaigns.length > 0 ? (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <Card key={campaign.id} className="overflow-hidden">
                  <div className={`h-1.5 w-full ${getStatusColor(campaign.status)}`}></div>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl">{campaign.name}</CardTitle>
                        <CardDescription>
                          Started: {campaign.startDate} · {campaign.clientGroup} ({campaign.clientCount} clients)
                        </CardDescription>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs uppercase font-semibold ${getStatusColor(campaign.status)}`}>
                        {campaign.status}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1 text-sm">
                          <span>Progress: {campaign.completedCalls} of {campaign.clientCount} calls completed</span>
                          <span>{campaign.progress}%</span>
                        </div>
                        <Progress value={campaign.progress} className="h-2" />
                      </div>
                      
                      <div className="flex text-sm text-muted-foreground">
                        <div className="flex items-center mr-4">
                          <Users className="h-4 w-4 mr-1" />
                          <span>{campaign.clientGroup}</span>
                        </div>
                        <div className="flex items-center">
                          <Settings className="h-4 w-4 mr-1" />
                          <span>{campaign.aiProfile}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t bg-muted/10 pt-4">
                    <div className="flex gap-2 w-full">
                      {campaign.status === 'active' ? (
                        <>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handlePauseCampaign(campaign.id)}>
                            <PauseCircle className="h-4 w-4 mr-2" />
                            Pause
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleStopCampaign(campaign.id)}>
                            <StopCircle className="h-4 w-4 mr-2" />
                            Stop
                          </Button>
                        </>
                      ) : campaign.status === 'paused' ? (
                        <>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleStartCampaign(campaign.id)}>
                            Resume
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleStopCampaign(campaign.id)}>
                            <StopCircle className="h-4 w-4 mr-2" />
                            Stop
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button className="flex-1" variant="outline" size="sm" onClick={() => handleStartCampaign(campaign.id)}>
                            Start
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDeleteCampaign(campaign.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-3 mb-4">
                  <Calendar className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Campaigns Yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create your first campaign to start reaching out to your clients.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Criar Nova Campanha</CardTitle>
              <CardDescription>
                Configure uma nova campanha de chamadas usando seu assistente de IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCampaign} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    placeholder="Summer Promotion 2023"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({...newCampaign, name: e.target.value})}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="clientGroup">Select Client Group</Label>
                  <Select
                    value={newCampaign.clientGroup}
                    onValueChange={(value) => setNewCampaign({...newCampaign, clientGroup: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client group" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingGroups ? (
                        <SelectItem value="loading" disabled>Loading client groups...</SelectItem>
                      ) : (
                        clientGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name} ({group.count} clients)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="aiProfile">Select AI Assistant</Label>
                  <Select
                    value={newCampaign.aiProfile}
                    onValueChange={(value) => setNewCampaign({...newCampaign, aiProfile: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an AI assistant" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiProfiles.length === 0 ? (
                        <SelectItem value="no-assistants" disabled>
                          No assistants available - create one in the Training section
                        </SelectItem>
                      ) : (
                        aiProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id.toString()}>
                            {profile.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {newCampaign.aiProfile && 
                      aiProfiles.find(p => p.id.toString() === newCampaign.aiProfile)?.description}
                    {aiProfiles.length === 0 && (
                      <span className="text-amber-500">
                        Você precisa criar um assistente na seção de Treinamento antes de criar uma campanha.
                      </span>
                    )}
                  </p>
                </div>
                
                <div className="pt-4">
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={aiProfiles.length === 0}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CampaignControls;

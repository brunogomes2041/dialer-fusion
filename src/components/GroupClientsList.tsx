
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Phone, X } from 'lucide-react';
import { Client } from '@/services/clientService';
import { clientGroupService } from '@/services/clientGroupService';
import { useToast } from '@/components/ui/use-toast';
import { webhookService } from '@/services/webhookService';
import { supabase } from '@/lib/supabase';

interface GroupClientsListProps {
  groupId: string;
  groupName: string;
  isOpen: boolean;
  onClose: () => void;
}

const GroupClientsList = ({ groupId, groupName, isOpen, onClose }: GroupClientsListProps) => {
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const [isCalling, setIsCalling] = useState<number | null>(null);
  
  const { 
    data: clients = [], 
    isLoading, 
    error,
    refetch
  } = useQuery({
    queryKey: ['clientsInGroup', groupId],
    queryFn: () => clientGroupService.getClientsInGroup(groupId),
    enabled: !!groupId && isOpen
  });

  const handleRemoveFromGroup = async (clientId: number) => {
    try {
      setIsRemoving(clientId);
      await clientGroupService.removeClientFromGroup(clientId, groupId);
      toast({
        title: "Cliente removido",
        description: "Cliente removido do grupo com sucesso.",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao remover cliente do grupo.",
        variant: "destructive"
      });
    } finally {
      setIsRemoving(null);
    }
  };

  const handleCall = async (client: Client) => {
    try {
      setIsCalling(client.id);
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      
      const result = await webhookService.triggerCallWebhook({
        action: 'start_call',
        campaign_id: 0, // Use 0 as a placeholder since there's no campaign associated
        client_id: client.id,
        client_name: client.name,
        client_phone: client.phone,
        user_id: userId,
        additional_data: {
          source: 'group_list',
          client_email: client.email,
          client_status: client.status,
          vapi_caller_id: "97141b30-c5bc-4234-babb-d38b79452e2a"
        }
      });
      
      if (result.success) {
        toast({
          title: "Ligação iniciada",
          description: `Iniciando ligação para ${client.name} (${client.phone})`,
        });
      } else {
        toast({
          title: "Erro ao iniciar ligação", 
          description: "Não foi possível iniciar a ligação. Tente novamente.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Erro ao iniciar ligação:', error);
      toast({
        title: "Erro", 
        description: "Ocorreu um erro ao tentar iniciar a ligação.",
        variant: "destructive"
      });
    } finally {
      setIsCalling(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Clientes no grupo: {groupName}</DialogTitle>
          <DialogDescription>
            Lista de todos os clientes associados a este grupo
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex justify-center p-6">
            <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
          </div>
        ) : error ? (
          <div className="text-center p-6 text-red-500">
            Erro ao carregar clientes
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center p-6 text-muted-foreground">
            Este grupo não possui clientes
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{client.phone}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>
                      <Badge variant={client.status === 'Active' ? 'default' : 'secondary'}>
                        {client.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCall(client);
                          }}
                          title="Ligar para cliente"
                          disabled={isCalling === client.id}
                        >
                          {isCalling === client.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Phone className="h-4 w-4" />
                          )}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromGroup(client.id);
                          }}
                          title="Remover do grupo"
                          disabled={isRemoving === client.id}
                        >
                          {isRemoving === client.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        
        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GroupClientsList;

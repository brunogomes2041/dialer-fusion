
import { supabase } from '@/lib/supabase';

export type Client = {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  account_id?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
};

export const clientService = {
  // Buscar todos os clientes do usuário atual
  async getClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*');

    if (error) {
      console.error("Error fetching clients:", error);
      throw new Error(`Erro ao buscar clientes: ${error.message}`);
    }

    return data || [];
  },

  // Buscar todos os clientes de uma conta específica
  async getClientsByAccount(accountId: string) {
    if (!accountId) {
      throw new Error('ID da conta é obrigatório');
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('account_id', accountId);

    if (error) {
      console.error(`Error fetching clients for account ${accountId}:`, error);
      throw new Error(`Erro ao buscar clientes da conta: ${error.message}`);
    }

    console.log(`Encontrados ${data?.length || 0} clientes para a conta ${accountId}`);
    return data || [];
  },

  // Buscar um cliente por ID
  async getClientById(id: number) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Erro ao buscar cliente: ${error.message}`);
    }

    return data;
  },

  // Adicionar um novo cliente
  async addClient(client: Omit<Client, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('clients')
      .insert(client)
      .select();

    if (error) {
      throw new Error(`Erro ao adicionar cliente: ${error.message}`);
    }

    return data;
  },

  // Adicionar um cliente e associá-lo a um grupo
  async addClientWithGroup(client: Omit<Client, 'id' | 'created_at' | 'updated_at'>, groupId: string) {
    try {
      // Primeiro adiciona o cliente
      const { data, error } = await supabase
        .from('clients')
        .insert(client)
        .select();

      if (error) {
        throw new Error(`Erro ao adicionar cliente: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        throw new Error('Erro ao adicionar cliente: Nenhum dado retornado');
      }
      
      const newClient = data[0];
      
      // Se um grupo foi especificado, adiciona o cliente ao grupo
      if (groupId && groupId !== 'none') {
        // Converter o groupId para number se necessário
        const numericGroupId = typeof groupId === 'string' && !isNaN(parseInt(groupId)) 
          ? parseInt(groupId) 
          : groupId;
          
        const { error: groupError } = await supabase
          .from('client_group_members')
          .insert({
            client_id: newClient.id,
            group_id: numericGroupId
          });
          
        if (groupError) {
          console.error('Erro ao adicionar cliente ao grupo:', groupError);
          // Não falha a operação principal se a associação com o grupo falhar
        }
      }

      return newClient;
    } catch (error) {
      console.error('Erro em addClientWithGroup:', error);
      throw error;
    }
  },


  // Atualizar um cliente existente
  async updateClient(id: number, client: Partial<Client>) {
    const { data, error } = await supabase
      .from('clients')
      .update(client)
      .eq('id', id)
      .select();

    if (error) {
      throw new Error(`Erro ao atualizar cliente: ${error.message}`);
    }

    return data;
  },

  // Excluir um cliente
  async deleteClient(id: number) {
    const { data, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      throw new Error(`Erro ao excluir cliente: ${error.message}`);
    }

    return data;
  },

  // Obter estatísticas dos clientes
  async getClientStats() {
    try {
      const { data: allClients, error: clientsError } = await supabase
        .from('clients')
        .select('id, status');

      if (clientsError) {
        console.error("Error fetching client stats:", clientsError);
        throw new Error(`Erro ao buscar estatísticas: ${clientsError.message}`);
      }

      const totalClients = allClients?.length || 0;
      const activeClients = allClients?.filter(client => client.status === 'Active')?.length || 0;

      return {
        totalClients,
        activeClients,
      };
    } catch (error) {
      console.error("Error in getClientStats:", error);
      return {
        totalClients: 0,
        activeClients: 0,
      };
    }
  },

  // Buscar clientes por grupo
  async getClientsByGroupId(groupId: string) {
    // Converter o groupId para number se necessário
    const numericGroupId = typeof groupId === 'string' && !isNaN(parseInt(groupId)) 
      ? parseInt(groupId) 
      : groupId;
      
    const { data, error } = await supabase
      .from('client_group_members')
      .select(`
        client_id,
        clients(*)
      `)
      .eq('group_id', numericGroupId);

    if (error) {
      throw new Error(`Erro ao buscar clientes por grupo: ${error.message}`);
    }

    const clients = data
      .map(item => {
        if (item.clients && typeof item.clients === 'object') {
          return item.clients as unknown as Client;
        }
        return null;
      })
      .filter((client): client is Client => client !== null);

    return clients;
  },
  // Importar clientes de uma planilha
  async importClients(clients: Omit<Client, 'id' | 'created_at' | 'updated_at'>[]) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw new Error(`Erro ao obter usuário: ${userError.message}`);

    const userId = userData?.user?.id;

    const clientsWithUserId = clients.map(client => ({
      ...client,
      user_id: userId,
    }));

    const { data, error } = await supabase
      .from('clients')
      .insert(clientsWithUserId)
      .select();

    if (error) {
      throw new Error(`Erro ao importar clientes: ${error.message}`);
    }

    return data as Client[];
  },
};

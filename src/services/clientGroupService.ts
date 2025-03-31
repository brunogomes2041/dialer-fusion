
import { supabase } from '@/lib/supabase';
import { Client } from './clientService';

export interface ClientGroup {
  id: string;
  name: string;
  description?: string;
  user_id: string;
  created_at: string;
  client_count?: number;
}

export interface ClientGroupMember {
  id: string;
  group_id: string;
  client_id: number;
  created_at: string;
}

export const clientGroupService = {
  // Get all client groups for a user
  getClientGroups: async (): Promise<ClientGroup[]> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('client_groups')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error fetching client groups:', error);
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('Error in getClientGroups:', error);
      throw error;
    }
  },
  
  // Create a new client group
  createClientGroup: async (group: Omit<ClientGroup, 'id' | 'created_at'>) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      const { data, error } = await supabase
        .from('client_groups')
        .insert([{ ...group, user_id: userId }])
        .select();
        
      if (error) {
        console.error('Error creating client group:', error);
        throw error;
      }
      
      return data[0];
    } catch (error) {
      console.error('Error in createClientGroup:', error);
      throw error;
    }
  },
  
  // Update a client group
  updateClientGroup: async (id: string, updates: Partial<ClientGroup>) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      const { data, error } = await supabase
        .from('client_groups')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select();
        
      if (error) {
        console.error('Error updating client group:', error);
        throw error;
      }
      
      return data[0];
    } catch (error) {
      console.error('Error in updateClientGroup:', error);
      throw error;
    }
  },
  
  // Delete a client group
  deleteClientGroup: async (id: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      // First delete all client-group relationships
      const { error: relationshipError } = await supabase
        .from('client_group_members')
        .delete()
        .eq('group_id', id);
        
      if (relationshipError) {
        console.error('Error deleting client group memberships:', relationshipError);
        throw relationshipError;
      }
      
      // Then delete the group
      const { error } = await supabase
        .from('client_groups')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
        
      if (error) {
        console.error('Error deleting client group:', error);
        throw error;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error in deleteClientGroup:', error);
      throw error;
    }
  },
  
  // Add a client to a group - otimizado para melhor performance
  addClientToGroup: async (clientId: number, groupId: string) => {
    try {
      // Ensure clientId is a number
      const numericClientId = typeof clientId === 'string' 
        ? parseInt(clientId, 10) 
        : clientId;
      
      // Check if the client is already in the group to avoid duplicates
      const { data: existingMembership, error: checkError } = await supabase
        .from('client_group_members')
        .select('*')
        .eq('client_id', numericClientId)
        .eq('group_id', groupId)
        .maybeSingle();
        
      if (checkError) {
        console.error('Error checking membership:', checkError);
        throw checkError;
      }
      
      // If already exists, return the existing record
      if (existingMembership) {
        return existingMembership;
      }
      
      // Create a new membership
      const { data, error } = await supabase
        .from('client_group_members')
        .insert([{ client_id: numericClientId, group_id: groupId }])
        .select();
        
      if (error) {
        console.error('Error adding client to group:', error);
        throw error;
      }
      
      return data[0];
    } catch (error) {
      console.error('Error in addClientToGroup:', error);
      throw error;
    }
  },
  
  // Remove a client from a group - otimizado para melhor performance
  removeClientFromGroup: async (clientId: number, groupId: string) => {
    try {
      const numericClientId = typeof clientId === 'string' 
        ? parseInt(clientId, 10) 
        : clientId;
      
      const { error } = await supabase
        .from('client_group_members')
        .delete()
        .eq('client_id', numericClientId)
        .eq('group_id', groupId);
        
      if (error) {
        console.error('Error removing client from group:', error);
        throw error;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error in removeClientFromGroup:', error);
      throw error;
    }
  },
  
  // Get all clients in a group - otimizado para melhor performance
  getClientsInGroup: async (groupId: string): Promise<Client[]> => {
    try {
      if (!groupId) return [];
      
      // Get the current user
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      // Consulta otimizada usando joins diretamente no Supabase
      const { data, error } = await supabase
        .from('client_group_members')
        .select('client_id, clients:client_id(*)')
        .eq('group_id', groupId);
        
      if (error) {
        console.error('Error fetching clients in group:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        return [];
      }
      
      // Use type assertion with proper checks to ensure each client has the required properties
      const clients: Client[] = [];
      
      for (const item of data) {
        if (
          item.clients && 
          typeof item.clients === 'object' && 
          'id' in item.clients && 
          'name' in item.clients && 
          'phone' in item.clients && 
          'email' in item.clients && // Check for email property
          'status' in item.clients && // Check for status property
          'user_id' in item.clients && 
          item.clients.user_id === userId
        ) {
          // Use unknown as an intermediate type to satisfy TypeScript
          const clientData = item.clients as unknown;
          // Then cast to Client
          clients.push(clientData as Client);
        }
      }
      
      return clients;
    } catch (error) {
      console.error('Error in getClientsInGroup:', error);
      return [];
    }
  },
  
  // Get all groups a client belongs to - otimizado
  getClientGroupsByClientId: async (clientId: number): Promise<ClientGroup[]> => {
    try {
      // Ensure clientId is a number
      const numericClientId = typeof clientId === 'string' 
        ? parseInt(clientId, 10) 
        : clientId;
      
      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      // Consulta otimizada usando joins diretamente no Supabase
      const { data, error } = await supabase
        .from('client_group_members')
        .select('group_id, groups:group_id(*)')
        .eq('client_id', numericClientId);
        
      if (error) {
        console.error('Error fetching client groups:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        return [];
      }
      
      // Use type assertion with proper checks to ensure each group has the required properties
      const groups: ClientGroup[] = [];
      
      for (const item of data) {
        if (
          item.groups && 
          typeof item.groups === 'object' && 
          'id' in item.groups && 
          'name' in item.groups && 
          'created_at' in item.groups && // Check for created_at property
          'user_id' in item.groups && 
          item.groups.user_id === userId
        ) {
          // Use unknown as an intermediate type to satisfy TypeScript
          const groupData = item.groups as unknown;
          // Then cast to ClientGroup
          groups.push(groupData as ClientGroup);
        }
      }
      
      return groups;
    } catch (error) {
      console.error('Error in getClientGroupsByClientId:', error);
      return [];
    }
  }
};

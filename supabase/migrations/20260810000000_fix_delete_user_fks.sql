-- FIX: permitir borrar usuarios/admins que tienen mensajes o chats asignados
-- Antes: messages.sender_id y conversations.assigned_admin_id tenían FK sin
-- ON DELETE → el borrado de un usuario con mensajes fallaba (RESTRICT implícito)

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_assigned_admin_id_fkey,
  ADD CONSTRAINT conversations_assigned_admin_id_fkey
    FOREIGN KEY (assigned_admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
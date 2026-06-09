-- Enable Supabase Realtime on messages table for real-time chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

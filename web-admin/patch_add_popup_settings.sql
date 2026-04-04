ALTER TABLE store_settings ADD COLUMN popup_settings JSONB DEFAULT '{"deadline_enabled": false, "chat_enabled": false, "chat_threshold_min": 30}'::jsonb;

-- Enable Realtime for the order_items table to trigger the Deadline popup immediately
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

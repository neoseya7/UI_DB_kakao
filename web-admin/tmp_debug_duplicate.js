const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: logs, error } = await supabase
    .from("chat_logs")
    .select("*")
    .eq("store_id", "9018fcb3-897d-47f2-8396-1f4ddf5701c9")
    .eq("collect_date", "2026-04-01")
    .eq("product_name", "대저토마토")
    .order("created_at", { ascending: false })
    .limit(50);
    
  if (error) {
    console.error(error);
  } else {
    require("fs").writeFileSync("_debug_out.json", JSON.stringify(logs, null, 2), "utf8");
  }
}

run();

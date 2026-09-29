const SUPABASE_URL = "https://takxmkchlaayctrultbp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QCVGtc5sySA-R1Gr3hSbag_JuY-k1aU";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Biblioteca Supabase não foi carregada.");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.SiloSupabase = {
  client: supabaseClient,
  async getUser(){ const {data,error}=await supabaseClient.auth.getUser(); if(error){ const msg=String(error.message||"").toLowerCase(); if(msg.includes("auth session missing")) return null; throw error; } return data.user||null; },
  async signIn(email,password){ return await supabaseClient.auth.signInWithPassword({email,password}); },
  async signOut(){ return await supabaseClient.auth.signOut(); },
  async getProfile(){ const u=await this.getUser(); if(!u)return null; const {data,error}=await supabaseClient.from("profiles").select("*").eq("id",u.id).maybeSingle(); if(error)throw error; return data; },
  async getSettings(){ const {data,error}=await supabaseClient.from("silo_settings").select("*").order("created_at",{ascending:true}).limit(1).maybeSingle(); if(error)throw error; return data; },
  async saveSettings(name,capacity,minimumStock,criticalStock,nextDeliveryDate){
    const current=await this.getSettings(), payload={
      name:String(name).trim(),
      capacity:Number(capacity),
      minimum_stock:Number(minimumStock),
      critical_stock:Number(criticalStock),
      next_delivery_date:nextDeliveryDate||null,
      unit:"kg"
    };
    if(current){const {data,error}=await supabaseClient.from("silo_settings").update(payload).eq("id",current.id).select().single();if(error)throw error;return data;}
    const {data,error}=await supabaseClient.from("silo_settings").insert(payload).select().single();if(error)throw error;return data;
  },
  async clearNextDelivery(){
    const current=await this.getSettings();
    if(!current) return null;
    const {data,error}=await supabaseClient.from("silo_settings").update({next_delivery_date:null}).eq("id",current.id).select().single();
    if(error)throw error;
    return data;
  },
  async getDeliveryHistory(){
    const {data,error}=await supabaseClient.from("cement_deliveries").select("id,delivered_at").order("delivered_at",{ascending:false}).limit(5);
    if(error)throw error;
    return data||[];
  },
  async registerCementDelivery(){
    const {data,error}=await supabaseClient.rpc("register_cement_delivery");
    if(error)throw error;
    return data;
  },
  async getMovements(){const {data,error}=await supabaseClient.from("movements").select("*").order("date",{ascending:true});if(error)throw error;return data||[];},
  async insertMovement(m){const u=await this.getUser();if(!u)throw new Error("Usuário não autenticado.");const payload={type:m.type,quantity:Number(m.quantity),date:m.date,observation:m.observation||"",user_id:u.id};const {data,error}=await supabaseClient.from("movements").insert(payload).select().single();if(error)throw error;return data;},
  async updateMovement(id,m){const payload={type:m.type,quantity:Number(m.quantity),date:m.date,observation:m.observation||""};const {data,error}=await supabaseClient.from("movements").update(payload).eq("id",id).select().single();if(error)throw error;return data;},
  async deleteMovement(id){const {error}=await supabaseClient.from("movements").delete().eq("id",id);if(error)throw error;}
};
const SUPABASE_URL = "https://takxmkchlaayctrultbp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QCVGtc5sySA-R1Gr3hSbag_JuY-k1aU";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Biblioteca Supabase não foi carregada.");
}

const AUTH_STORAGE_KEY = "controle-silo-v2.7.8-auth";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    storage: window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.SiloSupabase = {
  client: supabaseClient,
  async getUser(){
    const {data,error}=await supabaseClient.auth.getUser();
    if(error){
      const msg=String(error.message||"").toLowerCase();
      if(msg.includes("auth session missing")) return null;
      throw error;
    }
    return data.user||null;
  },
  async getSession(){
    const {data,error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    return data.session||null;
  },
  async signIn(email,password){
    const result=await supabaseClient.auth.signInWithPassword({email,password});
    if(result?.error || !result?.data?.session) return result;

    const session=result.data.session;
    const {data:sessionData,error:sessionError}=await supabaseClient.auth.setSession({
      access_token:session.access_token,
      refresh_token:session.refresh_token
    });
    if(sessionError) return {data:sessionData,error:sessionError};

    // Confirma que a sessão ficou instalada no armazenamento do cliente.
    const storedSession=await this.getSession();
    if(!storedSession){
      return {
        data:sessionData,
        error:new Error("A sessão foi autenticada, mas não pôde ser armazenada no navegador.")
      };
    }

    return {
      data:{
        user:sessionData?.session?.user || result.data.user,
        session:storedSession
      },
      error:null
    };
  },
  async signOut(){
    try{
      return await supabaseClient.auth.signOut();
    }finally{
      // Remove também a sessão persistida pelo cliente atual.
      try{ window.localStorage.removeItem(AUTH_STORAGE_KEY); }catch(_){}
    }
  },
  async getProfile(user){
    const u=user||await this.getUser();
    if(!u)return null;
    const {data,error}=await supabaseClient.from("profiles").select("*").eq("id",u.id).maybeSingle();
    if(error)throw error;
    return data;
  },
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
  async deleteCementDelivery(id){
    const {error}=await supabaseClient.from("cement_deliveries").delete().eq("id",id);
    if(error)throw error;
  },
  async getMovements(){const {data,error}=await supabaseClient.from("movements").select("*").order("date",{ascending:true});if(error)throw error;return data||[];},
  async insertMovement(m){const u=await this.getUser();if(!u)throw new Error("Usuário não autenticado.");const payload={type:m.type,quantity:Number(m.quantity),date:m.date,observation:m.observation||"",user_id:u.id};const {data,error}=await supabaseClient.from("movements").insert(payload).select().single();if(error)throw error;return data;},
  async updateMovement(id,m){const payload={type:m.type,quantity:Number(m.quantity),date:m.date,observation:m.observation||""};const {data,error}=await supabaseClient.from("movements").update(payload).eq("id",id).select().single();if(error)throw error;return data;},
  async deleteMovement(id){const {error}=await supabaseClient.from("movements").delete().eq("id",id);if(error)throw error;}
};
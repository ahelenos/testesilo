const SUPABASE_URL = "https://takxmkchlaayctrultbp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QCVGtc5sySA-R1Gr3hSbag_JuY-k1aU";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Biblioteca Supabase não foi carregada.");
}

const AUTH_STORAGE_KEY = "controle-fabrica-v4.1.3-auth";

// Sessão de autenticação restrita à aba/sessão do navegador.
// Assim o sistema não reutiliza automaticamente um login salvo de sessões
// anteriores, mas mantém a autenticação durante a navegação entre módulos.
const memoryStorage = (() => {
  const data = Object.create(null);
  return {
    getItem(key){ return Object.prototype.hasOwnProperty.call(data,key) ? data[key] : null; },
    setItem(key,value){ data[key]=String(value); },
    removeItem(key){ delete data[key]; }
  };
})();

function storageWorks(storage){
  try{
    const key = "__controle_silo_storage_test__";
    storage.setItem(key,"1");
    const ok = storage.getItem(key)==="1";
    storage.removeItem(key);
    return ok;
  }catch(_){ return false; }
}

const authStorage = storageWorks(window.sessionStorage)
  ? window.sessionStorage
  : memoryStorage;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Disponibiliza o cliente autenticado para as páginas que fazem consultas diretas.
window.supabaseClient = supabaseClient;

const SiloSupabase = {
  async getModulePermissions(user){
    const u=user||await this.getUser();
    if(!u) return {};
    const {data,error}=await supabaseClient.from("module_permissions")
      .select("module,permission").eq("user_id",u.id);
    if(error) throw error;
    return Object.fromEntries((data||[]).map(r=>[String(r.module).toLowerCase(),String(r.permission).toLowerCase()]));
  },
  async getModulePermission(module,user){
    const permissions=await this.getModulePermissions(user);
    const value=permissions[String(module).toLowerCase()];
    if(value) return value;
    const profile=await this.getProfile(user);
    return profile?.role==="admin" ? "admin" : "viewer";
  },
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

    // signInWithPassword já instala a sessão no cliente. Não chamamos
    // setSession novamente e não tratamos uma leitura imediata do storage
    // como prova de falha, pois alguns navegadores podem bloquear o storage.
    return result;
  },
  async signOut(){
    try{
      return await supabaseClient.auth.signOut();
    }finally{
      // Remove também a sessão persistida pelo cliente atual.
      try{ window.localStorage.removeItem(AUTH_STORAGE_KEY); }catch(_){}
      try{ window.sessionStorage.removeItem(AUTH_STORAGE_KEY); }catch(_){}
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
  async registerCementDelivery(quantity){
    const {data,error}=await supabaseClient.rpc("register_cement_delivery",{p_quantity:Number(quantity)});
    if(error)throw error;
    return data;
  },
  async deleteCementDelivery(id){
    const {data,error}=await supabaseClient.rpc("delete_cement_delivery",{p_id:id});
    if(error)throw error;
    return data;
  },
  async getMovements(){const {data,error}=await supabaseClient.from("movements").select("*").order("date",{ascending:true});if(error)throw error;return data||[];},
  async insertMovement(m){const u=await this.getUser();if(!u)throw new Error("Usuário não autenticado.");const payload={type:m.type,quantity:Number(m.quantity),concretagem_m3:m.type==="consumo"?Number(m.concretagem_m3):null,date:m.date,observation:m.observation||"",user_id:u.id};const {data,error}=await supabaseClient.from("movements").insert(payload).select().single();if(error)throw error;return data;},
  async updateMovement(id,m){const payload={type:m.type,quantity:Number(m.quantity),concretagem_m3:m.type==="consumo"?Number(m.concretagem_m3):null,date:m.date,observation:m.observation||""};const {data,error}=await supabaseClient.from("movements").update(payload).eq("id",id).select().single();if(error)throw error;return data;},
  async deleteMovement(id){const {error}=await supabaseClient.from("movements").delete().eq("id",id);if(error)throw error;}
};
window.SiloSupabase = SiloSupabase;

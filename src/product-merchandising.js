const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json = (payload,status=200) => new Response(JSON.stringify(payload),{status,headers});
const idOf = value => { const n=Number(value); return Number.isInteger(n)&&n>0?n:null; };
const nonNegativeNumber = (value,fallback=0) => { const n=Number(value); return Number.isFinite(n)&&n>=0?n:fallback; };
const positiveInteger = (value,fallback=7) => { const n=Number(value); return Number.isInteger(n)&&n>0?n:fallback; };

async function requireAdmin(token,env){
  const admin=await env.DB.prepare("SELECT firebase_uid FROM admin_users WHERE firebase_uid=? AND is_enabled=1").bind(token.sub).first();
  if(!admin) throw new Error("Administrator authorization required.");
}

async function getMerchandising(env,productId){
  const result=await env.DB.prepare(`SELECT p.id,p.name,p.sku,p.price,p.currency,p.status,p.stock_quantity,p.category_id,p.created_at,p.updated_at,
    CASE WHEN na.is_enabled=1 AND na.expires_at IS NOT NULL AND julianday(na.expires_at)>julianday('now') THEN 1 ELSE 0 END AS new_arrival_enabled,na.duration_days AS new_arrival_duration_days,na.starts_at AS new_arrival_starts_at,na.expires_at AS new_arrival_expires_at,
    COALESCE(pr.is_enabled,0) AS promotion_enabled,pr.promotion_price
    FROM products p
    LEFT JOIN product_new_arrivals na ON na.product_id=p.id
    LEFT JOIN product_promotions pr ON pr.product_id=p.id
    WHERE ${productId ? "p.id=?" : "1=1"}
    ORDER BY p.id DESC`).bind(...(productId?[productId]:[])).all();
  return result.results??[];
}

export async function handleProductMerchandising(request,env,verifyFirebaseIdToken){
  try{
    const token=await verifyFirebaseIdToken(request);
    await requireAdmin(token,env);
    const url=new URL(request.url);
    const productId=idOf(url.searchParams.get("product_id")||url.searchParams.get("id"));

    if(request.method==="GET"){
      const products=await getMerchandising(env,productId);
      return json({success:true,data:{products}});
    }

    if(request.method!=="PUT") return json({success:false,error:"Method not allowed."},405);
    if(!productId) return json({success:false,error:"A valid product id is required."},400);
    const product=await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first();
    if(!product) return json({success:false,error:"Product not found."},404);

    const body=await request.json();

    if(body?.new_arrival!==undefined){
      const incoming=body.new_arrival||{};
      const current=await env.DB.prepare("SELECT duration_days FROM product_new_arrivals WHERE product_id=?").bind(productId).first();
      const duration=positiveInteger(incoming.duration_days,current?.duration_days||7);
      const enabled=Boolean(incoming.enabled);
      const now=new Date();
      const startsAt=enabled?now.toISOString():null;
      const expiresAt=enabled?new Date(now.getTime()+duration*86400000).toISOString():null;
      await env.DB.prepare(`INSERT INTO product_new_arrivals(product_id,is_enabled,duration_days,starts_at,expires_at,updated_at)
        VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(product_id) DO UPDATE SET is_enabled=excluded.is_enabled,duration_days=excluded.duration_days,starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP`)
        .bind(productId,enabled?1:0,duration,startsAt,expiresAt).run();
    }

    if(body?.promotion!==undefined){
      const incoming=body.promotion||{};
      const enabled=Boolean(incoming.enabled);
      const current=await env.DB.prepare("SELECT promotion_price FROM product_promotions WHERE product_id=?").bind(productId).first();
      const raw=incoming.price??incoming.promotion_price??current?.promotion_price;
      const price=nonNegativeNumber(raw,-1);
      if(enabled&&price<0) return json({success:false,error:"Promotion price is required when a promotion is enabled."},400);
      await env.DB.prepare(`INSERT INTO product_promotions(product_id,is_enabled,promotion_price,updated_at)
        VALUES(?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(product_id) DO UPDATE SET is_enabled=excluded.is_enabled,promotion_price=excluded.promotion_price,updated_at=CURRENT_TIMESTAMP`)
        .bind(productId,enabled?1:0,Math.max(0,price)).run();
    }

    const saved=await getMerchandising(env,productId);
    return json({success:true,data:{product:saved[0]||null,uid:token.sub}});
  }catch(error){
    if(error?.message==="Administrator authorization required.") return json({success:false,error:error.message},403);
    if(error?.message==="Authentication required.") return json({success:false,error:error.message},401);
    return json({success:false,error:`Merchandising save failed: ${String(error?.message||"Unable to save merchandising settings.")}`},500);
  }
}

import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { getAccessToken } from "./auth.js";

dotenv.config();

/* =========================
   APP
========================= */
const app = express();
app.use(express.json());
app.use(express.static("public"));

const BLING = "https://www.bling.com.br/Api/v3";

let pedidoAtual = {};   // idProduto -> dados
let mapaCodigos = {};   // codigo -> idProduto
let blingOcupado = false;

/* =========================
   CLIENTE BLING
========================= */
async function bling() {
  const token = await getAccessToken();
  return axios.create({
    baseURL: BLING,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
}

/* =========================
   BUSCAR PEDIDO
========================= */
app.get("/pedido/:numero", async (req, res) => {

  if (blingOcupado) {
    return res.status(429).json({
      erro: "Aguarde, pedido em processamento..."
    });
  }

  blingOcupado = true;

  try {
    const api = await bling();

    // 1️⃣ Buscar pedido pelo número
    const lista = await api.get("/pedidos/vendas", {
      params: {
        numero: req.params.numero,
        limite: 1
      }
    });

    const pedidos = lista.data?.data;

    if (!Array.isArray(pedidos) || !pedidos.length) {
      return res.status(404).json({ erro: "Pedido não encontrado" });
    }

    const pedidoId = pedidos[0].id;

    // 2️⃣ Buscar detalhes do pedido
    const detalhe = await api.get(`/pedidos/vendas/${pedidoId}`);
    const pedido = detalhe.data?.data;

    if (!pedido || !Array.isArray(pedido.itens)) {
      return res.status(400).json({ erro: "Pedido sem itens válidos" });
    }

    pedidoAtual = {};
    mapaCodigos = {};

    // 3️⃣ Mapear itens
    for (const i of pedido.itens) {

      const idProduto = i.produto.id;

      if (!pedidoAtual[idProduto]) {
        pedidoAtual[idProduto] = {
          idProduto,
          nome: i.descricao,
          pedido: Number(i.quantidade),
          bipado: 0
        };
      }

      // SKU interno
      if (i.codigo) {
        mapaCodigos[String(i.codigo)] = idProduto;
      }

      // Código de barras / GTIN
      try {
        const prodResp = await api.get(`/produtos/${idProduto}`);
        const p = prodResp.data?.data;

        if (p?.codigoBarras) {
          mapaCodigos[String(p.codigoBarras)] = idProduto;
        }

        if (p?.gtin) {
          mapaCodigos[String(p.gtin)] = idProduto;
        }

      } catch {
        console.warn(`⚠️ Produto ${idProduto} sem dados completos`);
      }
    }

    res.json(pedidoAtual);

  } catch (e) {
    console.error("Erro Bling:", e.response?.data || e.message);
    res.status(500).json({ erro: "Erro ao carregar pedido" });

  } finally {
    blingOcupado = false;
  }
});

/* =========================
   SCAN
========================= */
app.post("/scan", (req, res) => {
  const { codigo } = req.body;

  const idProduto = mapaCodigos[codigo];

  if (!idProduto) {
    return res.status(400).json({ erro: "Produto não pertence ao pedido" });
  }

  const produto = pedidoAtual[idProduto];

  if (produto.bipado >= produto.pedido) {
    return res.status(400).json({ erro: "Quantidade excedida" });
  }

  produto.bipado++;

  res.json(produto);
});

/* =========================
   FINALIZAR
========================= */
app.post("/finalizar", async (req, res) => {
  const { confirmado } = req.body;

  // monta lista de faltantes
  const faltantes = Object.values(pedidoAtual)
    .filter(p => p.bipado < p.pedido)
    .map(p => `${p.nome} – faltaram ${p.pedido - p.bipado}`);

  // se houver faltantes e não confirmado, avisa
  if (faltantes.length && !confirmado) {
    return res.json({ faltantes });
  }

  try {
    const api = await bling();

    const itens = Object.values(pedidoAtual)
      .filter(p => p.bipado > 0)
      .map(p => ({
        produto: { id: p.idProduto },
        quantidade: p.bipado
      }));

    await api.post("/estoques/movimentacoes", {
      tipo: "S",
      observacoes: "Separação concluída",
      itens
    });

    res.json({ ok: true });

  } catch (e) {
    console.error("Erro ao finalizar:", e.response?.data || e.message);
    res.status(500).json({ erro: "Erro ao finalizar" });
  }
});

/* =========================
   START
========================= */
app.listen(3000, () => {
  console.log("🚀 Sistema rodando em http://localhost:3000");
});

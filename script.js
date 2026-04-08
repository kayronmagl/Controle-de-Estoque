"use strict";

const supabaseUrl = "https://bmxlvsxluwcxuydnlawc.supabase.co";
const supabasePublishableKey = "sb_publishable_jWyWeiYTnu4c8UllXXvm3g_0meVpJM2";
const AUTO_REFRESH_INTERVAL_MS = 15000;

const state = {
  view: "products",
  products: [],
  history: [],
  productSearch: "",
  productTypeFilter: "all",
  pendingIds: new Set(),
  isCreating: false,
  logoutRequested: false,
  session: null,
  productsUpdatedAt: null,
  historyUpdatedAt: null,
  autoRefreshTimerId: null,
};

const PRODUCT_TYPE_LABELS = {
  ingrediente: "Ingrediente",
  bebida: "Bebida",
  insumo: "Insumo",
  produto_preparado: "Preparado",
};

const PRODUCT_TYPE_ORDER = {
  ingrediente: 0,
  bebida: 1,
  insumo: 2,
  produto_preparado: 3,
};

const STOCK_UNIT_LABELS = {
  un: { short: "un", singular: "unidade", plural: "unidades" },
  kg: { short: "kg", singular: "kg", plural: "kg" },
  g: { short: "g", singular: "g", plural: "g" },
  l: { short: "l", singular: "l", plural: "l" },
  ml: { short: "ml", singular: "ml", plural: "ml" },
  lata: { short: "lata", singular: "lata", plural: "latas" },
  garrafa: { short: "garrafa", singular: "garrafa", plural: "garrafas" },
  pct: { short: "pct", singular: "pacote", plural: "pacotes" },
  cx: { short: "cx", singular: "caixa", plural: "caixas" },
};

const els = {
  authShell: document.getElementById("authShell"),
  authForm: document.getElementById("authForm"),
  authNotice: document.getElementById("authNotice"),
  authSubmitButton: document.getElementById("authSubmitButton"),
  appShell: document.getElementById("appShell"),
  currentUserChip: document.getElementById("currentUserChip"),
  signOutButton: document.getElementById("signOutButton"),
  noticeBar: document.getElementById("noticeBar"),
  refreshButton: document.getElementById("refreshButton"),
  productsTab: document.getElementById("productsTab"),
  historyTab: document.getElementById("historyTab"),
  productsView: document.getElementById("productsView"),
  historyView: document.getElementById("historyView"),
  productList: document.getElementById("productList"),
  historyList: document.getElementById("historyList"),
  alertsList: document.getElementById("alertsList"),
  productsEmptyState: document.getElementById("productsEmptyState"),
  historyEmptyState: document.getElementById("historyEmptyState"),
  alertsEmptyState: document.getElementById("alertsEmptyState"),
  createProductForm: document.getElementById("createProductForm"),
  createProductButton: document.getElementById("createProductButton"),
  productSearch: document.getElementById("productSearch"),
  productTypeFilters: document.getElementById("productTypeFilters"),
  accessModeNote: document.getElementById("accessModeNote"),
  productsRuntimeSummary: document.getElementById("productsRuntimeSummary"),
  historyRuntimeSummary: document.getElementById("historyRuntimeSummary"),
  metricTotal: document.getElementById("metricTotal"),
  metricOk: document.getElementById("metricOk"),
  metricLow: document.getElementById("metricLow"),
  metricCritical: document.getElementById("metricCritical"),
  productCardTemplate: document.getElementById("productCardTemplate"),
  historyCardTemplate: document.getElementById("historyCardTemplate"),
};

const isConfigured =
  supabaseUrl &&
  supabasePublishableKey &&
  supabasePublishableKey !== "SUA_PUBLISHABLE_KEY" &&
  typeof window.supabase !== "undefined";

const supabaseClient = isConfigured
  ? window.supabase.createClient(supabaseUrl, supabasePublishableKey)
  : null;

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  bindEvents();
  syncTypeFilterState();
  resetCreateForm();
  renderProducts();
  renderHistory();
  setAuthenticated(false);

  if (!isConfigured) {
    showAuthNotice(
      "Configure a SUPABASE_PUBLISHABLE_KEY em script.js e execute o database.sql no Supabase para iniciar.",
      "error",
      true,
    );
    return;
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAuthNotice(getErrorMessage(error, "Nao foi possivel validar a sessao atual."), "error", true);
    return;
  }

  await applySession(data.session, true);
}

function bindEvents() {
  els.authForm.addEventListener("submit", handleSignIn);
  els.signOutButton.addEventListener("click", handleSignOut);
  els.productsTab.addEventListener("click", () => setView("products"));
  els.historyTab.addEventListener("click", () => setView("history"));
  els.refreshButton.addEventListener("click", handleRefresh);
  els.productList.addEventListener("click", handleProductAction);
  els.createProductForm.addEventListener("submit", handleCreateProduct);
  els.productSearch.addEventListener("input", handleProductSearch);
  els.productTypeFilters.addEventListener("click", handleTypeFilterClick);
  window.addEventListener("focus", handleWindowFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

async function applySession(session, silent = false) {
  const currentToken = state.session?.access_token || null;
  const nextToken = session?.access_token || null;
  const sessionChanged = currentToken !== nextToken;

  state.session = session || null;
  setAuthenticated(Boolean(session?.user));
  syncAutoRefresh();

  if (!state.session) {
    if (sessionChanged || !silent) {
      resetState();
      clearNotice();

      if (state.logoutRequested) {
        state.logoutRequested = false;
        showAuthNotice("Sessao encerrada.", "success", true);
      } else {
        showAuthNotice("Entre com email e senha para acessar o controle de estoque.", "warning", true);
      }
    }

    return;
  }

  state.logoutRequested = false;
  clearAuthNotice();
  updateCurrentUser(session.user);

  if (!sessionChanged && silent) {
    return;
  }

  await fetchProducts(true);

  if (state.view === "history") {
    await fetchHistory(true);
  }

  if (!silent) {
    showNotice("Acesso liberado.", "success");
  }
}

function setAuthenticated(authenticated) {
  const isAuthenticated = Boolean(authenticated);

  els.authShell.hidden = isAuthenticated;
  els.appShell.hidden = !isAuthenticated;
  els.currentUserChip.hidden = !isAuthenticated;

  if (els.accessModeNote) {
    els.accessModeNote.hidden = !isAuthenticated;
    els.accessModeNote.classList.remove("is-warning", "is-success");

    if (isAuthenticated) {
      els.accessModeNote.textContent =
        "Acesso autenticado ativo. Cadastro, atualizacao de estoque e historico estao liberados.";
      els.accessModeNote.classList.add("is-success");
    }
  }

  syncCreateFormState();
}

function updateCurrentUser(user) {
  const email = user?.email || "usuario autenticado";
  els.currentUserChip.textContent = email;
}

async function handleSignIn(event) {
  event.preventDefault();

  if (!supabaseClient) {
    showAuthNotice("A configuracao do Supabase ainda nao foi concluida.", "error", true);
    return;
  }

  const formData = new FormData(els.authForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    showAuthNotice("Informe email e senha para entrar.", "error", true);
    return;
  }

  setAuthFormDisabled(true);
  showAuthNotice("Validando acesso...", "warning", true);

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const activeSession =
      data?.session ||
      (await supabaseClient.auth.getSession()).data.session ||
      null;

    if (!activeSession?.user) {
      throw new Error("Sessao de login nao retornada.");
    }

    await applySession(activeSession);
    showAuthNotice("Acesso validado. Carregando painel...", "success", true);
    els.authForm.reset();
  } catch (error) {
    showAuthNotice(getErrorMessage(error, "Nao foi possivel realizar o login."), "error", true);
  } finally {
    setAuthFormDisabled(false);
  }
}

async function handleSignOut() {
  if (!supabaseClient) {
    return;
  }

  if (state.logoutRequested) {
    return;
  }

  els.signOutButton.disabled = true;
  state.logoutRequested = true;
  await applySession(null, true);

  try {
    const { error } = await supabaseClient.auth.signOut({ scope: "local" });

    if (error) {
      throw error;
    }
  } catch (error) {
    showAuthNotice(getErrorMessage(error, "Nao foi possivel encerrar a sessao."), "error", true);
  } finally {
    els.signOutButton.disabled = false;
  }
}

async function handleRefresh() {
  if (!supabaseClient || !state.session) {
    showAuthNotice("Faca login para atualizar os dados.", "warning", true);
    return;
  }

  await refreshActiveData();
}

function setView(view) {
  state.view = view;
  els.productsTab.classList.toggle("is-active", view === "products");
  els.historyTab.classList.toggle("is-active", view === "history");
  els.productsView.classList.toggle("is-active", view === "products");
  els.historyView.classList.toggle("is-active", view === "history");

  if (view === "products" && state.session) {
    fetchProducts(true);
  }

  if (view === "history" && state.session) {
    fetchHistory();
  }
}

async function fetchProducts(silent = false) {
  if (!supabaseClient || !state.session) {
    return;
  }

  if (!silent) {
    showNotice("Carregando produtos...");
  }

  try {
    const { data, error } = await supabaseClient.rpc("list_products");

    if (error) {
      throw error;
    }

    state.products = sortProducts(
      (Array.isArray(data) ? data : []).filter((product) => product?.is_active !== false),
    );
    state.productsUpdatedAt = new Date().toISOString();
    renderProducts();
    clearNotice();
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel carregar os produtos."), "error", true);
  }
}

async function fetchHistory(silent = false) {
  if (!supabaseClient || !state.session) {
    return;
  }

  if (!silent) {
    showNotice("Carregando historico...");
  }

  try {
    const { data, error } = await supabaseClient.rpc("list_movements");

    if (error) {
      throw error;
    }

    state.history = (Array.isArray(data) ? data : []).slice(0, 30);
    state.historyUpdatedAt = new Date().toISOString();
    renderHistory();
    clearNotice();
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel carregar o historico."), "error", true);
  }
}

function handleProductSearch(event) {
  state.productSearch = String(event.target.value || "").trim().toLowerCase();
  renderProducts();
}

function handleTypeFilterClick(event) {
  const button = event.target.closest("[data-type-filter]");

  if (!button) {
    return;
  }

  state.productTypeFilter = button.dataset.typeFilter || "all";
  syncTypeFilterState();
  renderProducts();
}

async function handleWindowFocus() {
  await refreshActiveData(true);
}

async function handleVisibilityChange() {
  if (document.hidden) {
    return;
  }

  await refreshActiveData(true);
}

async function handleProductAction(event) {
  const button = event.target.closest("[data-action]");

  if (!button || !ensureWriteAccess()) {
    return;
  }

  const card = button.closest("[data-product-id]");

  if (!card) {
    return;
  }

  const productId = card.dataset.productId;
  const action = button.dataset.action;
  const type = action === "increase" ? "entrada" : "saida";

  await updateStock(productId, type);
}

async function handleCreateProduct(event) {
  event.preventDefault();

  if (!supabaseClient || !ensureWriteAccess()) {
    return;
  }

  if (state.isCreating) {
    return;
  }

  const formData = new FormData(els.createProductForm);
  const name = String(formData.get("name") || "").trim();
  const productType = String(formData.get("product_type") || "ingrediente").trim();
  const stockUnit = String(formData.get("stock_unit") || "un").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") || "0"), 10);
  const minQuantity = Number.parseInt(String(formData.get("min_quantity") || "0"), 10);

  if (!name) {
    showNotice("Informe o nome do item antes de salvar.", "error", true);
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    showNotice("A quantidade inicial precisa ser um inteiro maior ou igual a zero.", "error", true);
    return;
  }

  if (!Number.isInteger(minQuantity) || minQuantity < 1) {
    showNotice("O minimo ideal precisa ser um inteiro maior ou igual a um.", "error", true);
    return;
  }

  if (!PRODUCT_TYPE_LABELS[productType]) {
    showNotice("Selecione um tipo de item valido.", "error", true);
    return;
  }

  if (!STOCK_UNIT_LABELS[stockUnit]) {
    showNotice("Selecione uma unidade valida.", "error", true);
    return;
  }

  const duplicate = state.products.some(
    (product) => String(product.name || "").trim().toLowerCase() === name.toLowerCase(),
  );

  if (duplicate) {
    showNotice("Ja existe um item com esse nome no estoque.", "error", true);
    return;
  }

  state.isCreating = true;
  syncCreateFormState();
  showNotice("Salvando novo item...");

  try {
    const { error } = await supabaseClient.rpc("create_product_with_initial_stock", {
      p_name: name,
      p_initial_quantity: quantity,
      p_min_quantity: minQuantity,
      p_product_type: productType,
      p_stock_unit: stockUnit,
    });

    if (error) {
      throw error;
    }

    await fetchProducts(true);
    await fetchHistory(true);
    resetCreateForm();
    showNotice(`Item ${name} cadastrado com sucesso.`, "success");
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel cadastrar o item."), "error", true);
  } finally {
    state.isCreating = false;
    syncCreateFormState();
  }
}

async function updateStock(id, type) {
  if (!supabaseClient || !state.session || state.pendingIds.has(id)) {
    return;
  }

  const product = state.products.find((item) => item.id === id);

  if (!product) {
    return;
  }

  const delta = type === "entrada" ? 1 : -1;
  const previousQuantity = Number(product.quantity) || 0;
  const nextQuantity = Math.max(0, previousQuantity + delta);

  if (type === "saida" && previousQuantity === 0) {
    showNotice("A quantidade ja esta em zero.", "error");
    return;
  }

  state.pendingIds.add(id);
  renderProducts();
  showNotice("Atualizando estoque...");

  try {
    const { error } = await supabaseClient.rpc("apply_stock_movement", {
      p_product_id: id,
      p_type: type,
      p_quantity: 1,
    });

    if (error) {
      throw error;
    }

    await fetchProducts(true);
    await fetchHistory(true);

    const updatedProduct = state.products.find((item) => item.id === id) || {
      ...product,
      quantity: nextQuantity,
    };

    showNotice(buildStockNotice(updatedProduct, type), getNoticeTone(updatedProduct));
  } catch (error) {
    showNotice(getErrorMessage(error, "Nao foi possivel atualizar o estoque."), "error", true);
  } finally {
    state.pendingIds.delete(id);
    renderProducts();
  }
}

function renderProducts() {
  els.productList.innerHTML = "";

  const visibleProducts = getVisibleProducts();
  const metrics = {
    total: visibleProducts.length,
    ok: 0,
    low: 0,
    critical: 0,
  };

  if (visibleProducts.length === 0) {
    els.productsEmptyState.hidden = false;
    els.productsEmptyState.textContent = buildProductsEmptyStateMessage();
  } else {
    els.productsEmptyState.hidden = true;
  }

  visibleProducts.forEach((product) => {
    const status = getStatus(product.quantity, product.min_quantity);
    metrics[status.key] += 1;

    const card = els.productCardTemplate.content.firstElementChild.cloneNode(true);
    const pending = state.pendingIds.has(product.id);

    card.dataset.productId = product.id;
    card.classList.toggle("is-pending", pending);
    card.classList.add(`product-card-${status.key}`);
    card.querySelector(".product-name").textContent = product.name;
    card.querySelector(".product-type-badge").textContent = getProductTypeLabel(product.product_type);
    card.querySelector(".product-unit-badge").textContent = getUnitShortLabel(product.stock_unit);
    card.querySelector(".product-min").textContent = String(product.min_quantity ?? 5);
    card.querySelector(".product-unit").textContent = getUnitShortLabel(product.stock_unit);
    card.querySelector(".quantity-value").textContent = String(product.quantity ?? 0);
    card.querySelector(".quantity-unit").textContent = getUnitLabel(product.stock_unit, product.quantity ?? 0);
    card.querySelector(".stock-note").textContent = buildProductStockNote(product, status);

    const quantityBlock = card.querySelector(".quantity-block");
    quantityBlock.classList.add(`quantity-block-${status.key}`);

    const stockProgressFill = card.querySelector(".stock-progress-fill");
    stockProgressFill.style.width = `${getStockProgressPercentage(product.quantity, product.min_quantity)}%`;
    stockProgressFill.classList.add(`stock-progress-fill-${status.key}`);

    const statusBadge = card.querySelector(".status-badge");
    statusBadge.textContent = status.label;
    statusBadge.classList.add(`status-${status.key}`);

    card.querySelectorAll(".action-button").forEach((button) => {
      button.disabled = pending || !state.session;
    });

    els.productList.appendChild(card);
  });

  els.metricTotal.textContent = String(metrics.total);
  els.metricOk.textContent = String(metrics.ok);
  els.metricLow.textContent = String(metrics.low);
  els.metricCritical.textContent = String(metrics.critical);
  if (els.productsRuntimeSummary) {
    els.productsRuntimeSummary.textContent = buildProductsRuntimeSummary(
      visibleProducts.length,
      state.products.length,
    );
  }
  renderAlerts();
}

function renderHistory() {
  els.historyList.innerHTML = "";

  if (state.history.length === 0) {
    els.historyEmptyState.hidden = false;
    els.historyEmptyState.textContent =
      "As movimentacoes mais recentes vao aparecer aqui em ordem decrescente.";
    if (els.historyRuntimeSummary) {
      els.historyRuntimeSummary.textContent = buildHistoryRuntimeSummary(0);
    }
    return;
  }

  els.historyEmptyState.hidden = true;
  if (els.historyRuntimeSummary) {
    els.historyRuntimeSummary.textContent = buildHistoryRuntimeSummary(state.history.length);
  }

  state.history.forEach((movement) => {
    const card = els.historyCardTemplate.content.firstElementChild.cloneNode(true);
    const productName = movement.products?.name || "Produto removido";
    const stockUnit = movement.products?.stock_unit || "un";
    const historyFlow = getHistoryFlow(movement);

    card.classList.add(`history-card-${movement.type}`);
    card.querySelector(".history-product").textContent = productName;
    card.querySelector(".history-summary").textContent = formatMovementSummary(movement);
    card.querySelector(".history-detail").textContent = buildHistoryDetail(movement);
    card.querySelector(".history-date").textContent = formatDate(movement.created_at);

    const historyFlowNode = card.querySelector(".history-flow");

    if (historyFlow) {
      card.querySelector(".history-flow-before").textContent = historyFlow.before;
      card.querySelector(".history-flow-after").textContent = historyFlow.after;
    } else {
      historyFlowNode.hidden = true;
    }

    const typeNode = card.querySelector(".history-type");
    typeNode.textContent = capitalize(movement.type);
    typeNode.classList.add(`history-type-${movement.type}`);

    card.querySelector(".history-quantity").textContent = formatQuantityWithUnit(movement.quantity, stockUnit);
    els.historyList.appendChild(card);
  });
}

function renderAlerts() {
  els.alertsList.innerHTML = "";

  const alertProducts = state.products
    .map((product) => ({
      product,
      status: getStatus(product.quantity, product.min_quantity),
    }))
    .filter((entry) => entry.status.key !== "ok")
    .sort((left, right) => {
      const severity = {
        critical: 0,
        low: 1,
      };

      const severityDiff = severity[left.status.key] - severity[right.status.key];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return (left.product.quantity ?? 0) - (right.product.quantity ?? 0);
    });

  if (alertProducts.length === 0) {
    els.alertsEmptyState.hidden = false;
    els.alertsEmptyState.textContent =
      "Nenhum item em falta no momento. O estoque esta operando dentro do minimo ideal.";
    return;
  }

  els.alertsEmptyState.hidden = true;

  alertProducts.forEach(({ product, status }) => {
    const card = document.createElement("article");
    card.className = `alert-card alert-${status.key}`;

    const top = document.createElement("div");
    top.className = "alert-card-top";

    const title = document.createElement("h3");
    title.className = "alert-card-title";
    title.textContent = product.name;

    const badge = document.createElement("span");
    badge.className = `status-badge status-${status.key}`;
    badge.textContent = status.label;

    const body = document.createElement("p");
    body.className = "alert-card-body";
    body.textContent = buildAlertMessage(product, status);

    top.append(title, badge);
    card.append(top, body);
    els.alertsList.appendChild(card);
  });
}

function getStatus(quantity, minQuantity) {
  const safeQuantity = Number(quantity) || 0;
  const safeMin = Number(minQuantity) || 5;
  const criticalLimit = Math.max(1, Math.floor(safeMin / 2));

  if (safeQuantity <= criticalLimit) {
    return { key: "critical", label: "Critico" };
  }

  if (safeQuantity <= safeMin) {
    return { key: "low", label: "Baixo" };
  }

  return { key: "ok", label: "OK" };
}

function formatDate(value) {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMovementSummary(movement) {
  const amount = Number(movement.quantity) || 0;
  const stockUnit = movement.products?.stock_unit || "un";
  return `${capitalize(movement.type)} de ${formatQuantityWithUnit(amount, stockUnit)}`;
}

function buildAlertMessage(product, status) {
  const quantity = Number(product.quantity) || 0;
  const minimum = Number(product.min_quantity) || 5;
  const missing = Math.max(0, minimum - quantity);
  const stockUnit = product.stock_unit || "un";

  if (status.key === "critical") {
    return `Nivel critico: ${formatQuantityWithUnit(quantity, stockUnit)} em estoque. Reponha ${formatQuantityWithUnit(missing || 1, stockUnit)} ou mais para sair da zona critica.`;
  }

  return `Estoque baixo: ${formatQuantityWithUnit(quantity, stockUnit)} disponiveis. O minimo ideal configurado e ${formatQuantityWithUnit(minimum, stockUnit)}.`;
}

function buildStockNotice(product, type) {
  const status = getStatus(product.quantity, product.min_quantity);
  const actionText = type === "entrada" ? "Entrada registrada." : "Saida registrada.";

  if (status.key === "critical") {
    return `${actionText} ${product.name} ficou em nivel critico.`;
  }

  if (status.key === "low") {
    return `${actionText} ${product.name} esta com estoque baixo.`;
  }

  return `${actionText} ${product.name} segue com estoque OK.`;
}

function getNoticeTone(product) {
  const status = getStatus(product.quantity, product.min_quantity);

  if (status.key === "critical") {
    return "error";
  }

  if (status.key === "low") {
    return "warning";
  }

  return "success";
}

function showNotice(message, tone = "info", keepVisible = false) {
  window.clearTimeout(showNotice.timeoutId);
  els.noticeBar.hidden = false;
  els.noticeBar.textContent = message;
  els.noticeBar.classList.remove("is-error", "is-success", "is-warning");

  if (tone === "error") {
    els.noticeBar.classList.add("is-error");
  }

  if (tone === "success") {
    els.noticeBar.classList.add("is-success");
  }

  if (tone === "warning") {
    els.noticeBar.classList.add("is-warning");
  }

  if (keepVisible) {
    return;
  }

  showNotice.timeoutId = window.setTimeout(clearNotice, 2400);
}

function clearNotice() {
  els.noticeBar.hidden = true;
  els.noticeBar.textContent = "";
  els.noticeBar.classList.remove("is-error", "is-success", "is-warning");
}

function showAuthNotice(message, tone = "info", keepVisible = false) {
  window.clearTimeout(showAuthNotice.timeoutId);
  els.authNotice.hidden = false;
  els.authNotice.textContent = message;
  els.authNotice.classList.remove("is-error", "is-success", "is-warning");

  if (tone === "error") {
    els.authNotice.classList.add("is-error");
  }

  if (tone === "success") {
    els.authNotice.classList.add("is-success");
  }

  if (tone === "warning") {
    els.authNotice.classList.add("is-warning");
  }

  if (keepVisible) {
    return;
  }

  showAuthNotice.timeoutId = window.setTimeout(clearAuthNotice, 3000);
}

function clearAuthNotice() {
  els.authNotice.hidden = true;
  els.authNotice.textContent = "";
  els.authNotice.classList.remove("is-error", "is-success", "is-warning");
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  const code = String(error.code || "");
  const message = String(error.message || "").trim();

  if (code === "23505" || message.toLowerCase().includes("duplicate key")) {
    return "Ja existe um item com esse nome no estoque.";
  }

  if (message.includes("Estoque insuficiente")) {
    return "Estoque insuficiente para registrar a saida.";
  }

  if (message.includes("Produto nao encontrado")) {
    return "Produto nao encontrado.";
  }

  if (message.includes("Operacao nao autorizada")) {
    return "Voce nao tem permissao para realizar esta operacao.";
  }

  if (message.includes("Invalid login credentials")) {
    return "Email ou senha invalidos.";
  }

  return fallbackMessage;
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getProductTypeLabel(productType) {
  return PRODUCT_TYPE_LABELS[productType] || "Item";
}

function getUnitShortLabel(stockUnit) {
  return STOCK_UNIT_LABELS[stockUnit]?.short || "un";
}

function getUnitLabel(stockUnit, quantity = 1) {
  const unitMeta = STOCK_UNIT_LABELS[stockUnit] || STOCK_UNIT_LABELS.un;

  return quantity === 1 ? unitMeta.singular : unitMeta.plural;
}

function formatQuantityWithUnit(quantity, stockUnit) {
  const safeQuantity = Number(quantity) || 0;

  return `${safeQuantity} ${getUnitLabel(stockUnit, safeQuantity)}`;
}

function buildProductsRuntimeSummary(visibleCount, totalCount) {
  const lastSync = formatSyncTime(state.productsUpdatedAt);

  if (!state.session) {
    return "Sem sessao ativa.";
  }

  if (totalCount === 0) {
    return `Nenhum item carregado${lastSync ? ` · ${lastSync}` : ""}`;
  }

  if (visibleCount !== totalCount) {
    return `${visibleCount} de ${totalCount} itens visiveis · ${lastSync}`;
  }

  return `${totalCount} itens carregados · ${lastSync}`;
}

function buildHistoryRuntimeSummary(totalCount) {
  const lastSync = formatSyncTime(state.historyUpdatedAt);

  if (!state.session) {
    return "Sem sessao ativa.";
  }

  return `${totalCount} registros recentes · ${lastSync}`;
}

function formatSyncTime(value) {
  if (!value) {
    return "aguardando sincronizacao";
  }

  return `atualizado ${new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

function getStockProgressPercentage(quantity, minQuantity) {
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const safeMin = Math.max(1, Number(minQuantity) || 1);

  return Math.min(100, Math.round((safeQuantity / safeMin) * 100));
}

function buildProductStockNote(product, status) {
  const quantity = Number(product.quantity) || 0;
  const minimum = Math.max(1, Number(product.min_quantity) || 1);
  const stockUnit = product.stock_unit || "un";
  const missing = Math.max(0, minimum - quantity);
  const surplus = Math.max(0, quantity - minimum);

  if (status.key === "critical") {
    if (quantity === 0) {
      return `Item zerado. Reponha ${formatQuantityWithUnit(minimum, stockUnit)} para normalizar o estoque.`;
    }

    return `Faltam ${formatQuantityWithUnit(missing, stockUnit)} para sair do nivel critico.`;
  }

  if (status.key === "low") {
    return `Faltam ${formatQuantityWithUnit(missing, stockUnit)} para atingir o minimo ideal.`;
  }

  if (surplus === 0) {
    return "Estoque exatamente no minimo ideal configurado.";
  }

  return `${formatQuantityWithUnit(surplus, stockUnit)} acima do minimo ideal.`;
}

function buildHistoryDetail(movement) {
  const productType = getProductTypeLabel(movement.products?.product_type);
  const unitShort = getUnitShortLabel(movement.products?.stock_unit);
  const reason = getMovementReasonLabel(movement.reason);

  return `${productType} | ${unitShort} | ${reason}`;
}

function getHistoryFlow(movement) {
  const stockUnit = movement.products?.stock_unit || "un";
  const previousQuantity =
    movement.previous_quantity !== null && movement.previous_quantity !== undefined
      ? Number(movement.previous_quantity)
      : null;
  const resultQuantity =
    movement.result_quantity !== null && movement.result_quantity !== undefined
      ? Number(movement.result_quantity)
      : null;

  if (previousQuantity === null || resultQuantity === null) {
    return null;
  }

  return {
    before: formatQuantityWithUnit(previousQuantity, stockUnit),
    after: formatQuantityWithUnit(resultQuantity, stockUnit),
  };
}

function getMovementReasonLabel(reason) {
  const reasonLabels = {
    cadastro_inicial: "Cadastro inicial",
    entrada_manual: "Entrada manual",
    saida_manual: "Saida manual",
    ajuste_manual: "Ajuste manual",
    correcao: "Correcao",
    reposicao: "Reposicao",
    perda: "Perda",
  };

  return reasonLabels[reason] || "Movimentacao";
}

function syncTypeFilterState() {
  els.productTypeFilters.querySelectorAll("[data-type-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.typeFilter === state.productTypeFilter);
  });
}

function getVisibleProducts() {
  const searchTerm = state.productSearch;

  return state.products.filter((product) => {
    const matchesType =
      state.productTypeFilter === "all" || product.product_type === state.productTypeFilter;
    const matchesSearch =
      !searchTerm || String(product.name || "").toLowerCase().includes(searchTerm);

    return matchesType && matchesSearch;
  });
}

function buildProductsEmptyStateMessage() {
  if (!state.session) {
    return "Entre no sistema para carregar os produtos cadastrados.";
  }

  if (state.products.length === 0) {
    return "Nenhum produto encontrado. Cadastre itens na tabela products para iniciar o controle.";
  }

  return "Nenhum item corresponde aos filtros atuais.";
}

function sortProducts(products) {
  return [...products].sort((left, right) => {
    const typeDiff =
      (PRODUCT_TYPE_ORDER[left.product_type] ?? 99) - (PRODUCT_TYPE_ORDER[right.product_type] ?? 99);

    if (typeDiff !== 0) {
      return typeDiff;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
  });
}

async function refreshActiveData(silent = false) {
  if (!supabaseClient || !state.session) {
    return;
  }

  await fetchProducts(silent);

  if (state.view === "history") {
    await fetchHistory(silent);
  }
}

function syncAutoRefresh() {
  if (state.autoRefreshTimerId) {
    window.clearInterval(state.autoRefreshTimerId);
    state.autoRefreshTimerId = null;
  }

  if (!state.session) {
    return;
  }

  state.autoRefreshTimerId = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    refreshActiveData(true);
  }, AUTO_REFRESH_INTERVAL_MS);
}

function ensureWriteAccess() {
  if (state.session) {
    return true;
  }

  showAuthNotice("Faca login para editar o estoque.", "warning", true);
  return false;
}

function setAuthFormDisabled(disabled) {
  Array.from(els.authForm.elements).forEach((element) => {
    element.disabled = disabled;
  });

  els.authSubmitButton.textContent = disabled ? "Entrando..." : "Entrar no controle";
}

function syncCreateFormState() {
  const disabled = state.isCreating || !state.session;

  Array.from(els.createProductForm.elements).forEach((element) => {
    element.disabled = disabled;
  });

  els.createProductButton.textContent = state.isCreating ? "Salvando..." : "Adicionar item";
}

function resetCreateForm() {
  els.createProductForm.reset();
  els.createProductForm.elements.namedItem("product_type").value = "ingrediente";
  els.createProductForm.elements.namedItem("stock_unit").value = "un";
  els.createProductForm.elements.namedItem("quantity").value = "0";
  els.createProductForm.elements.namedItem("min_quantity").value = "5";
}

function resetState() {
  state.products = [];
  state.history = [];
  state.productSearch = "";
  state.productTypeFilter = "all";
  state.pendingIds.clear();
  state.isCreating = false;
  state.productsUpdatedAt = null;
  state.historyUpdatedAt = null;
  els.productSearch.value = "";
  if (els.productsRuntimeSummary) {
    els.productsRuntimeSummary.textContent = "";
  }
  if (els.historyRuntimeSummary) {
    els.historyRuntimeSummary.textContent = "";
  }
  syncTypeFilterState();
  syncCreateFormState();
  renderProducts();
  renderHistory();
}

<div align="center">
  <h1>Controle de Estoque - Tobias Lanches</h1>
  <p><b>Gestão de inventário e persistência de dados integrada para o nosso quiosque</b></p>
  <br>
  <a href="https://vercel.app">
    <b>VISUALIZAR PROJETO ONLINE</b>
  </a>
</div>

## **Sobre o Projeto**
Construí este sistema especialmente para o nosso quiosque, funcionando como o braço direito do cardápio digital. A ideia foi criar um ambiente administrativo seguro onde possamos gerenciar o inventário por trás das cenas. Com ele, conseguimos ter o controle total de tudo o que entra e sai, com a certeza de que os dados estão salvos e organizados em um banco de dados confiável.

## Por que construí isso?
Especialmente em um **quiosque**, é fácil se perder no que tem ou não disponível para venda. Desenvolvi esta ferramenta para substituir o controle manual por um sistema digital estruturado. O foco aqui é garantir que a gestão do nosso estoque seja tão ágil quanto o atendimento, permitindo atualizar quantidades e produtos em tempo real de qualquer dispositivo.

## Funcionalidades Principais
<table width="100%">
  <tr>
    <td width="30%"><b>Gestão de Inventário</b></td>
    <td>Interface completa para cadastrar, editar e remover produtos do estoque do quiosque.</td>
  </tr>
  <tr>
    <td width="30%"><b>Controle de Quantidade</b></td>
    <td>Monitoramento preciso do volume de itens disponíveis para evitar falta de produtos.</td>
  </tr>
  <tr>
    <td width="30%"><b>Persistência de Dados</b></td>
    <td>Integração com Supabase para garantir que o histórico do estoque nunca se perca.</td>
  </tr>
  <tr>
    <td width="30%"><b>Listagem Dinâmica</b></td>
    <td>Visualização clara e atualizada de todos os itens carregados diretamente do backend.</td>
  </tr>
  <tr>
    <td width="30%"><b>Foco Operacional</b></td>
    <td>Design responsivo feito para ser usado rapidamente pelo celular ou tablet durante o turno.</td>
  </tr>
</table>

## Tecnologias Utilizadas
*   **Frontend:** HTML5, CSS3 e JavaScript Vanilla (ES6+).
*   **Backend e Banco de Dados:** Supabase (BaaS) com lógica em PL/pgSQL.
*   **Hospedagem:** Vercel.

## Configuração do Banco de Dados
Para o funcionamento correto da aplicação, é necessário configurar uma tabela no Supabase com a seguinte estrutura:

```sql
CREATE TABLE produtos (
  id int8 PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nome TEXT NOT NULL,
  quantidade INT NOT NULL DEFAULT 0,
  preco NUMERIC,
  descricao TEXT
);
```

<h2 align="left">Licença e Uso</h2>
<p align="justify">
  Este projeto é de <b>uso restrito e exclusivo</b> ao nosso quiosque, disponível apenas para visualização e consulta interna. Não é permitida a distribuição, modificação ou uso comercial do código sem autorização prévia. Todos os direitos são reservados ao autor.
</p>

<br>

<div align="center">
  <p>Desenvolvido por <b>Kayron Magalhães</b></p>
</div>

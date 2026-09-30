# E-mails de pedido (EmailJS)

A loja usa a mesma conta EmailJS da loja de planos. O envio sai do servidor
(Edge Functions do Supabase), nunca do navegador: só pedidos reais geram
e-mail e ninguém consegue usar o site para mandar mensagens em nome da loja.

## Quais e-mails saem

| Quando | Para quem | Assunto |
|---|---|---|
| Pedido feito no site | Cliente (se informou e-mail) | Recebemos seu pedido #CÓDIGO |
| Pedido feito no site | Loja (e-mail em Configurações > Loja) | Novo pedido #CÓDIGO · valor · entrega/retirada |
| Pedido confirmado, saiu para entrega, pronto para retirada ou cancelado | Cliente | Pedido #CÓDIGO confirmado (etc.) |

Os avisos de status podem ser desligados em Configurações > Pagamento e avisos.
No pedido, o painel mostra cada e-mail (enviado, falhou, não enviado) e tem o
botão "Reenviar confirmação". Se o EmailJS falhar, o pedido é criado mesmo
assim e a equipe avisa pelo WhatsApp.

**Cota:** o plano grátis do EmailJS permite 200 envios por mês (cada pedido
gasta 2: cliente e loja; cada aviso de status gasta mais 1).

## Configuração (uma vez)

### 1. Modelo de e-mail

EmailJS > Email Templates > Create New Template. Um único modelo atende todos
os e-mails, porque o conteúdo já vai pronto:

| Campo do modelo | Valor |
|---|---|
| Subject | `{{subject}}` |
| Content (modo código/HTML) | `{{{content_html}}}` (três chaves: o HTML não é escapado) |
| To Email | `{{to_email}}` |
| From Name | `{{from_name}}` |
| Reply To | `{{reply_to}}` |

Salve e anote o **Template ID** (ex.: `template_abc123`). O **Service ID** é o
serviço de e-mail já conectado (ex.: o Gmail usado nos planos).

### 2. Liberar o envio pelo servidor

EmailJS > Account > Security:

- marque **Allow EmailJS API for non-browser applications**;
- marque **Use Private Key (recommended)**.

Em Account > General (ou API Keys) copie a **Public Key** e a **Private Key**.

### 3. Segredos no Supabase

Supabase > Edge Functions > Secrets (ou `supabase secrets set`):

| Nome | Valor |
|---|---|
| `EMAILJS_SERVICE_ID` | Service ID |
| `EMAILJS_TEMPLATE_ID` | Template ID do modelo acima |
| `EMAILJS_PUBLIC_KEY` | Public Key |
| `EMAILJS_PRIVATE_KEY` | Private Key (segredo: nunca no código nem no GitHub) |

Sem essas quatro, o e-mail fica desligado: a loja funciona e o painel mostra
"E-mail não configurado".

### 4. Testar

Faça um pedido no site informando seu e-mail. Devem chegar a confirmação (no
seu e-mail) e o aviso de pedido novo (no e-mail da loja). Se não chegar, veja
Supabase > Edge Functions > create-order > Logs (evento `notify.email`) e o
histórico de e-mails do pedido no painel.

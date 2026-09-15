import { Controller, Get, Header } from '@nestjs/common';

@Controller('')
export class AppController {
  @Get()
  @Header('Content-Type', 'text/html')
  findAll() {
    return `
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
  />

  <meta
    name="description"
    content="Stadion Bron Bot — stadionlarni toping, vaqt tanlang, bron qiling va onlayn to'lang."
  />
  <link rel="icon" type="image/png" href="/logo.png" />

  <title>Stadion Bron Bot</title>

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --green: #00e676;
      --green-dark: #00bd62;
      --white: #ffffff;
      --muted: #b8c4d1;
      --border: rgba(255, 255, 255, 0.12);
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      min-height: 100vh;

      font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Arial,
        sans-serif;

      color: var(--white);
      overflow-x: hidden;

      background:
        linear-gradient(
          180deg,
          rgba(2, 10, 20, 0.40),
          rgba(2, 15, 10, 0.82)
        ),
        url('/stadion.png') center center / cover fixed no-repeat;

      background-color: #061019;
    }

    body::before {
      content: "";

      position: fixed;
      inset: 0;

      pointer-events: none;

      background:
        radial-gradient(
          circle at 50% 35%,
          rgba(0, 230, 118, 0.08),
          transparent 35%
        ),
        linear-gradient(
          90deg,
          rgba(0, 0, 0, 0.35),
          transparent 50%,
          rgba(0, 0, 0, 0.35)
        );

      z-index: 0;
    }

    .page {
      position: relative;
      z-index: 1;

      min-height: 100vh;

      display: flex;
      flex-direction: column;
    }

    /* ================= HEADER ================= */

    header {
      width: 100%;

      padding: 24px 6%;

      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;

      color: white;
      text-decoration: none;

      font-size: 18px;
      font-weight: 800;
    }

    .brand-icon {
      width: 42px;
      height: 42px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 12px;

      background:
        linear-gradient(
          135deg,
          rgba(0, 230, 118, 0.95),
          rgba(0, 160, 80, 0.95)
        );

      box-shadow:
        0 8px 25px rgba(0, 230, 118, 0.25);

      font-size: 22px;
    }

    .brand span {
      color: var(--green);
    }

    .server {
      display: flex;
      align-items: center;
      gap: 9px;

      padding: 9px 15px;

      border-radius: 999px;

      background: rgba(0, 0, 0, 0.28);

      border: 1px solid rgba(255, 255, 255, 0.1);

      backdrop-filter: blur(12px);

      color: #d8e2eb;

      font-size: 13px;
    }

    .server-dot {
      width: 8px;
      height: 8px;

      border-radius: 50%;

      background: var(--green);

      box-shadow:
        0 0 0 5px rgba(0, 230, 118, 0.12),
        0 0 15px rgba(0, 230, 118, 0.8);
    }

    /* ================= HERO ================= */

    .hero {
      flex: 1;

      display: flex;
      align-items: center;
      justify-content: center;

      padding: 50px 20px 80px;
    }

    .hero-content {
      width: min(1050px, 100%);

      text-align: center;

      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;

      padding: 8px 15px;

      margin-bottom: 25px;

      border-radius: 999px;

      background: rgba(0, 230, 118, 0.09);

      border: 1px solid rgba(0, 230, 118, 0.25);

      color: #baf8d7;

      font-size: 13px;
      font-weight: 600;

      backdrop-filter: blur(10px);
    }

    .badge-dot {
      width: 6px;
      height: 6px;

      border-radius: 50%;

      background: var(--green);
    }

    h1 {
      max-width: 900px;

      font-size: clamp(42px, 7vw, 82px);

      line-height: 0.98;

      letter-spacing: -0.055em;

      font-weight: 850;

      margin-bottom: 28px;

      text-shadow:
        0 5px 35px rgba(0, 0, 0, 0.45);
    }

    h1 .green {
      color: var(--green);

      text-shadow:
        0 0 35px rgba(0, 230, 118, 0.18);
    }

    .subtitle {
      max-width: 680px;

      color: #d3dce5;

      font-size: clamp(16px, 2vw, 20px);

      line-height: 1.7;

      margin-bottom: 38px;
    }

    /* ================= BUTTON ================= */

    .actions {
      display: flex;
      align-items: center;
      justify-content: center;

      gap: 14px;

      flex-wrap: wrap;
    }

    .telegram-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;

      gap: 12px;

      min-width: 215px;

      padding: 17px 30px;

      border-radius: 16px;

      background:
        linear-gradient(
          135deg,
          #00e676,
          #00bd62
        );

      color: #001b0d;

      font-size: 16px;
      font-weight: 800;

      text-decoration: none;

      box-shadow:
        0 15px 40px rgba(0, 230, 118, 0.28);

      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }

    .telegram-btn:hover {
      transform: translateY(-4px);

      box-shadow:
        0 20px 50px rgba(0, 230, 118, 0.4);
    }

    .telegram-icon {
      font-size: 21px;
    }

    .arrow {
      font-size: 20px;

      transition:
        transform 0.2s ease;
    }

    .telegram-btn:hover .arrow {
      transform: translateX(4px);
    }

    /* ================= FEATURES ================= */

    .features {
      width: min(1050px, 100%);

      display: grid;

      grid-template-columns:
        repeat(4, 1fr);

      gap: 14px;

      margin-top: 70px;
    }

    .feature {
      padding: 24px 18px;

      text-align: center;

      background:
        rgba(4, 13, 23, 0.48);

      border:
        1px solid var(--border);

      border-radius: 20px;

      backdrop-filter: blur(16px);

      -webkit-backdrop-filter: blur(16px);

      transition:
        transform 0.2s ease,
        border-color 0.2s ease,
        background 0.2s ease;
    }

    .feature:hover {
      transform: translateY(-5px);

      border-color:
        rgba(0, 230, 118, 0.25);

      background:
        rgba(4, 20, 16, 0.62);
    }

    .feature-icon {
      width: 50px;
      height: 50px;

      margin: 0 auto 16px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 14px;

      background:
        rgba(0, 230, 118, 0.1);

      border:
        1px solid rgba(0, 230, 118, 0.18);

      font-size: 22px;
    }

    .feature h3 {
      font-size: 15px;

      margin-bottom: 7px;
    }

    .feature p {
      color: #93a3b3;

      font-size: 12px;

      line-height: 1.55;
    }

    /* ================= FOOTER ================= */

    footer {
      padding: 0 20px 28px;

      text-align: center;

      color: #758594;

      font-size: 12px;
    }

    footer strong {
      color: #9cabb8;
    }

    /* ================= TABLET ================= */

    @media (max-width: 800px) {

      header {
        padding: 18px 20px;
      }

      .brand {
        font-size: 16px;
      }

      .brand-icon {
        width: 38px;
        height: 38px;

        font-size: 20px;
      }

      .server {
        padding: 8px 11px;

        font-size: 11px;
      }

      .hero {
        padding:
          45px 18px
          55px;
      }

      h1 {
        font-size:
          clamp(42px, 13vw, 64px);

        letter-spacing: -0.045em;
      }

      .subtitle {
        font-size: 15px;

        line-height: 1.65;

        max-width: 520px;
      }

      .features {
        grid-template-columns:
          repeat(2, 1fr);

        margin-top: 55px;
      }

      .feature {
        padding: 20px 13px;
      }
    }

    /* ================= MOBILE ================= */

    @media (max-width: 480px) {

      header {
        align-items: flex-start;
      }

      .brand span {
        display: none;
      }

      .server {
        font-size: 10px;
      }

      .hero {
        padding-top: 35px;
      }

      .badge {
        font-size: 11px;
      }

      h1 {
        font-size: 46px;
      }

      .subtitle {
        font-size: 14px;
      }

      .telegram-btn {
        width: 100%;

        max-width: 320px;
      }

      .features {
        gap: 10px;
      }

      .feature {
        border-radius: 16px;
      }

      .feature-icon {
        width: 44px;
        height: 44px;
      }

      .feature h3 {
        font-size: 13px;
      }

      .feature p {
        font-size: 11px;
      }
    }
  </style>
</head>

<body>

  <div class="page">

    <!-- HEADER -->

    <header>

      <a class="brand" href="/">

        <div class="brand-icon">
          ⚽
        </div>

        <div>
          Stadion <span>Bron Bot</span>
        </div>

      </a>


      <div class="server">

        <span class="server-dot"></span>

        Tizim faol

      </div>

    </header>


    <!-- HERO -->

    <main class="hero">

      <div class="hero-content">

        <div class="badge">

          <span class="badge-dot"></span>

          Stadion bron qilish endi yanada oson

        </div>


        <h1>

          O‘yiningizni
          <span class="green">
            oldindan band qiling.
          </span>

        </h1>


        <p class="subtitle">

          Yaqin atrofdagi stadionlarni toping,
          qulay vaqtni tanlang, joyingizni bron qiling
          va to‘lovni onlayn amalga oshiring.
          Barchasi bitta Telegram botda.

        </p>


        <!-- TELEGRAM BUTTON -->

        <div class="actions">

          <a
            href="https://t.me/${process.env.BOT_USERNAME}"
            class="telegram-btn"
          >

            <span class="telegram-icon">
              ✈
            </span>

            <span>
              Botni ochish
            </span>

            <span class="arrow">
              →
            </span>

          </a>

        </div>


        <!-- FEATURES -->

        <section class="features">


          <div class="feature">

            <div class="feature-icon">
              🔎
            </div>

            <h3>
              Stadionni toping
            </h3>

            <p>
              O‘zingizga qulay stadionni
              tez va oson toping.
            </p>

          </div>


          <div class="feature">

            <div class="feature-icon">
              📅
            </div>

            <h3>
              Vaqtni tanlang
            </h3>

            <p>
              Bo‘sh vaqtlarni ko‘ring
              va kerakli vaqtni bron qiling.
            </p>

          </div>


          <div class="feature">

            <div class="feature-icon">
              💳
            </div>

            <h3>
              Onlayn to‘lang
            </h3>

            <p>
              Bron uchun to‘lovni
              qulay va xavfsiz amalga oshiring.
            </p>

          </div>


          <div class="feature">

            <div class="feature-icon">
              🛡️
            </div>

            <h3>
              Ishonchli xizmat
            </h3>

            <p>
              Bronlaringiz va to‘lovlaringiz
              tizim orqali nazorat qilinadi.
            </p>

          </div>


        </section>

      </div>

    </main>


    <!-- FOOTER -->

    <footer>

      <strong>
        Stadion Bron Bot
      </strong>

      &nbsp;•&nbsp;

      Stadion bron qilishning qulay usuli

    </footer>

  </div>

</body>
</html>
    `;
  }
}
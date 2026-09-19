# SmartTrading-V2

[![Nexus Agent Graph](https://img.shields.io/badge/Orchestrator-Nexus%20Agent%20Graph-00f0ff?style=for-the-badge&logo=probot)](https://github.com/98H)
[![Autonomous SWE Factory](https://img.shields.io/badge/Architecture-StateGraph%2024%2F7-10b981?style=for-the-badge)](https://github.com/98H)
[![Spec Kit](https://img.shields.io/badge/Spec%20Kit-SDD%20Gherkin-f59e0b?style=for-the-badge)](https://github.com/98H)
[![Live Deployment](https://img.shields.io/badge/Deployment-Live%20Preview-8b5cf6?style=for-the-badge)](/preview/prod-smarttrading-v2-9a6089/)

## 🎯 معرفی محصول و هدف راهبردی
> Full-stack interactive web trading terminal with WebGL candlestick canvas, LuxAlgo indicators suite, Pine Script executor, reactive multi-timeframe dashboard, and live CCXT crypto feeds.

این محصول به صورت کاملاً خودگردان و مبتنی بر چرخه حیات چابک ۲۴/۷ توسط **نکسوس ایجنت گراف (Nexus Agent Graph)** معماری، آزمون و مستقر شده است.

## 🚀 استقرار زنده و دسترسی به سامانه
- **پیوند دسترسی زنده (Live Preview):** [/preview/prod-smarttrading-v2-9a6089/](/preview/prod-smarttrading-v2-9a6089/)
- **مستندات مشروح استقرار:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **مشخصات نیازمندی‌های سیستم:** [.specify/memory/constitution.md](.specify/memory/constitution.md)

## 🏛️ معماری سیستم و نمودار جریان داده (StateGraph)
```mermaid
flowchart TD
    InputReq["📋 نیازمندی محصول و مشخصات BDD"] --> NodeSpec["📐 1. معمار مشخصات (Spec Kit)"]
    NodeSpec --> NodeTest["🧪 2. سازنده آزمون‌های TDD"]
    NodeTest --> NodeCoder["💻 3. توسعه‌دهنده کد اجرایی"]
    NodeCoder --> NodeSandbox["🛡️ 4. محفظه ایزوله آزمون"]
    NodeSandbox --> GateTest{"آیا تست‌ها پاس شدند؟"}
    GateTest -- "خیر (خطا)" --> NodeCoder
    GateTest -- "بله" --> NodeReviewer["🔍 5. بازبین ارشد کد"]
    NodeReviewer --> GateReview{"تأیید کیفیت معماری؟"}
    GateReview -- "اصلاح" --> NodeCoder
    GateReview -- "تأیید" --> NodeGit["📦 6. تجمیع گیت و استقرار خودکار"]
    NodeGit --> OutputProd["🚀 محصول مستقر روی سرور و گیت‌هاب"]
```

## 📊 وضعیت پیشرفت بک‌لاگ چابک
- **اپیک‌ها (Epics):** 0 مورد
- **تسک‌های مهندسی (Tasks):** 0 مورد
- **داستان‌های کاربری (Stories):** 0 مورد (تکمیل‌شده: 0)

## 💻 راه‌اندازی و اجرای محلی
```bash
# ۱. کلون ریپازیتوری
git clone https://github.com/98H/nexus-smarttrading-v2.git
cd nexus-smarttrading-v2

# ۲. آماده‌سازی محیط پایتون
python3 -m venv .venv
source .venv/bin/activate

# ۳. نصب وابستگی‌ها و اجرای تست‌ها
pytest tests/

# ۴. اجرای وب‌سرویس یا پیش‌نمایش محصول
python3 app.py
```

## 🛡️ اصالت و مهندسی خودگردان
- **کارخانه نرم‌افزار خودگردان:** Nexus Agent Graph Engine
- **توسعه‌دهنده ارشد و معمار سیستم:** Hossein Mohammadi ([@98H](https://github.com/98H))
- **تاریخ آخرین همگام‌سازی:** 2026-09-19 22:58:42 UTC
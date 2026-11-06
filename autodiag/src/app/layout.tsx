import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowUpRight } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = { title: { default: "AutoDiag — справочник автомобильной диагностики", template: "%s | AutoDiag" }, description: "Понятный справочник ошибок OBD-II, симптомов и индикаторов автомобиля.", robots: { index: false, follow: true } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body><header className="header"><div className="shell header-inner"><Link href="/" className="brand" aria-label="AutoDiag — главная"><span className="brand-mark"><Activity size={22} strokeWidth={2.5}/></span><span>auto<span className="brand-orange">diag</span><small>АВТОМОБИЛЬНЫЙ СПРАВОЧНИК</small></span></Link><nav className="nav" aria-label="Основная навигация"><Link href="/codes/">Коды ошибок</Link><Link href="/symptoms/">Симптомы</Link><Link href="/dashboard/">Индикаторы</Link><Link href="/guides/">Инструкции</Link></nav><Link className="header-cta" href="/codes/">Найти ошибку <ArrowUpRight size={16}/></Link></div></header><main>{children}</main><footer className="footer"><div className="shell footer-inner"><div><Link href="/" className="footer-brand">auto<span>diag</span><i>.</i></Link><p>Понятно об автомобильной диагностике.<br/>От первых признаков к следующему шагу.</p></div><div><strong>СПРАВОЧНИК</strong><Link href="/codes/">Коды OBD-II</Link><Link href="/symptoms/">Симптомы</Link><Link href="/dashboard/">Индикаторы</Link></div><div><strong>ПОЛЕЗНОЕ</strong><Link href="/guides/">Инструкции</Link><Link href="/about/">О проекте</Link><Link href="/privacy/">Конфиденциальность</Link></div><div className="footer-note">Информация на сайте носит справочный характер и не заменяет диагностику автомобиля специалистом.</div></div><div className="shell copyright">© 2026 AutoDiag <span>Сделано для тех, кто хочет разобраться.</span></div></footer></body></html>
}


import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "О проекте DiagDoc", description: "О справочнике автомобильной диагностики DiagDoc и принципах работы с материалами.", path: "/about/" });
export default function About(){return <div className="shell simple-page"><span className="kicker">О ПРОЕКТЕ</span><h1>Автомобильная диагностика понятным языком<span className="orange">.</span></h1><p>DiagDoc — демонстрационный справочник об ошибках OBD-II, симптомах и индикаторах автомобиля. Его задача — помочь разобраться в возможных направлениях проверки.</p><p>Материалы пока ожидают редакционной проверки и не заменяют руководство производителя или профессиональную диагностику. Код ошибки сам по себе не устанавливает неисправную деталь.</p><Link className="text-link" href="/codes/">Перейти к справочнику →</Link></div>}


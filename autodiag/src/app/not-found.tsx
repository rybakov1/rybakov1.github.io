import Link from "next/link";
export default function NotFound(){return <div className="shell not-found"><span className="kicker">ОШИБКА 404</span><h1>Похоже, мы свернули<br/>не туда<span className="orange">.</span></h1><p>Такой страницы нет. Вернитесь на главную или попробуйте найти нужный код.</p><Link className="search-button" href="/">На главную →</Link></div>}

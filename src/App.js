
/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useRef, createContext, useContext, lazy, Suspense, memo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, onSnapshot, runTransaction, addDoc, serverTimestamp, query, updateDoc, increment, writeBatch, orderBy, limit, getDocs, startAfter, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import DOMPurify from 'dompurify';

// =================================================================================================
// === 1. КОНФИГУРАЦИЈА И FIREBASE ИНИЦИЈАЛИЗАЦИЈА =================================================
// =================================================================================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: "AIzaSyCgZRJ9Car1HOblUKTVep7ZUdCn3N13b8k",
        authDomain: "bard-frontend-df8d8.firebaseapp.com",
        projectId: "bard-frontend-df8d8",
        storageBucket: "bard-frontend-df8d8.appspot.com",
        messagingSenderId: "735226734754",
        appId: "1:735226734754:web:3c08ac925d3937b66dcffb",
        measurementId: "G-C0X8Y800BW"
      };
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let app, db, auth, storage;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
} catch (e) { console.error("Firebase initialization failed:", e); }

const AD_SENSE_CLIENT_ID = "ca-pub-4032904434823555";
const NEWS_COLLECTION_NAME = 'sportiko_articles_multilang_v6';
const POLL_COLLECTION_NAME = 'sportiko_polls_v1';
const NEWS_PAGE_SIZE = 10;

// ================================================================
// === ВАЖНО: АДМИНИСТРАТОРСКА КОНФИГУРАЦИЈА (НОВ ПРИСТАП) =========
// ================================================================
// Порано, листата на администратори беше чувана овде. Тоа е небезбедно.
// НОВИОТ, ПОБЕЗБЕДЕН НАЧИН:
// 1. Креирајте колекција во вашата Firestore база со име "admins".
// 2. Во таа колекција, за секој администратор, додајте нов документ.
//    - Document ID мора да биде UID-то на корисникот-администратор.
//    - Документот може да биде празен или да содржи поле, на пр. { isAdmin: true }.
// 3. Безбедносните правила (firestore.rules) сега ја користат `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`
//    за да проверат дали корисникот е администратор.
//
// Оваа променлива `ADMIN_UIDS` ја оставаме тука САМО за визуелни потреби - за брзо
// прикажување/сокривање на копчињата во корисничкиот интерфејс. Вистинската безбедност
// е на серверот и е дефинирана во `firestore.rules`. Ако некој и да го измени
// клиентскиот код, нема да може да изврши администраторски акции.
const ADMIN_UIDS = ['13606344605732256160']; // Се користи само за UI


// =================================================================================================
// === 2. СИСТЕМ ЗА ПРЕВОД (I18N) И КОНТЕКСТ ======================================================
// =================================================================================================
const translations = {
    searchPlaceholder: { mk: 'Пребарај...', en: 'Search...' },
    searchPlaceholderMobile: { mk: 'Пребарај вести...', en: 'Search for news...' },
    dailyDose: { mk: 'Вашата дневна доза фудбал', en: 'Your daily dose of football' },
    latestNews: { mk: 'Најнови Вести', en: 'Latest News' },
    noNewsForFilter: { mk: 'Моментално нема вести за избраниот филтер...', en: 'There are currently no news for the selected filter...' },
    showMoreNews: { mk: 'Прикажи повеќе вести', en: 'Show more news' },
    loadingMore: { mk: 'Вчитувам...', en: 'Loading...' },
    backToNews: { mk: 'Назад кон вестите', en: 'Back to news' },
    league: { mk: 'Лига', en: 'League' },
    views: { mk: 'прегледи', en: 'views' },
    shareNews: { mk: 'Сподели ја веста:', en: 'Share the news:' },
    shareOnFacebook: { mk: 'Сподели на Facebook', en: 'Share on Facebook' },
    shareOnX: { mk: 'Сподели на X', en: 'Share on X' },
    shareOnInstagramStory: { mk: 'Сподели на Instagram Story', en: 'Share on Instagram Story' },
    copyLink: { mk: 'Копирај линк', en: 'Copy link' },
    instagramStoryHelp: { mk: 'Линкот е копиран! Отворете Instagram и залепете го во вашата Story.', en: 'Link copied! Open Instagram and paste it into your Story.' },
    copyLinkSuccess: { mk: 'Линкот е копиран во клипборд!', en: 'Link copied to clipboard!' },
    copyLinkError: { mk: 'Копирањето не успеа.', en: 'Copy failed.' },
    facebook: { mk: 'Facebook', en: 'Facebook' },
    x: { mk: 'X', en: 'X' },
    instagram: { mk: 'Instagram', en: 'Instagram' },
    copy: { mk: 'Копирај', en: 'Copy' },
    copied: { mk: 'Копирано!', en: 'Copied!' },
    relatedNews: { mk: 'Поврзани вести', en: 'Related News' },
    mostRead: { mk: 'Најчитани вести (Неделно)', en: 'Most Read News (Weekly)' },
    noPopularNews: { mk: 'Нема популарни вести оваа недела.', en: 'No popular news this week.' },
    quizOfTheDay: { mk: 'Квиз на денот', en: 'Quiz of the Day' },
    correctAnswer: { mk: 'Точен одговор!', en: 'Correct answer!' },
    incorrectAnswer: { mk: 'Неточно. Точниот одговор е: ', en: 'Incorrect. The correct answer is: ' },
    favoriteTeam: { mk: 'Омилен Тим', en: 'Favorite Team' },
    selectFavoriteTeam: { mk: 'Изберете го вашиот омилен тим!', en: 'Choose your favorite team!' },
    selectTeamPrompt: { mk: '-- Изберете тим --', en: '-- Select a team --' },
    thankYouForVote: { mk: 'Ви благодариме за гласот!', en: 'Thank you for your vote!' },
    votesSuffix: { mk: 'гласови', en: 'votes' },
    mainLeagues: { mk: 'Главни лиги', en: 'Main Leagues' },
    otherLeagues: { mk: 'Останати лиги', en: 'Other Leagues' },
    legalInfo: { mk: 'Правни инфо.', en: 'Legal Info' },
    privacyPolicy: { mk: 'Политика за приватност', en: 'Privacy Policy' },
    termsOfUse: { mk: 'Услови за користење', en: 'Terms of Use' },
    contact: { mk: 'Контакт', en: 'Contact' },
    copyright: { mk: 'Сите права задржани.', en: 'All rights reserved.' },
    cookieMessage: { mk: 'Користиме технологии за да го подобриме вашето искуство.', en: 'We use technologies to enhance your experience.' },
    learnMore: { mk: 'Дознај повеќе', en: 'Learn more' },
    agree: { mk: 'Се согласувам', en: 'I agree' },
    adPlaceholder: { mk: 'Простор за реклама', en: 'Advertisement Space' },
    errorLoadingNews: {mk: 'Грешка при вчитување на вестите. Обидете се повторно подоцна.', en: 'Error loading news. Please try again later.'},
    authErrorTitle: { mk: 'Грешка при автентикација', en: 'Authentication Error' },
    authErrorCheckConfig: { mk: 'Ве молиме проверете ја вашата Firebase конфигурација и дали е овозможена анонимна најава.', en: 'Please check your Firebase configuration and ensure Anonymous sign-in is enabled.' },
    bookmarkPage: { mk: 'Зачувај во обележувачи', en: 'Bookmark Page' },
    bookmarkInstructionsTitle: { mk: 'Обележи ја страницава', en: 'Bookmark this page' },
    bookmarkInstructions: { mk: 'Притиснете Ctrl+D (или ⌘+D на Mac) за да ја додадете оваа страница во вашите обележувачи.', en: 'Press Ctrl+D (or ⌘+D on Mac) to bookmark this page.' },
    ok: { mk: 'Во ред', en: 'OK' },
    publishNews: { mk: 'Објави Вест', en: 'Publish News' },
    publishArticle: { mk: 'Објави ја статијата', en: 'Publish Article' },
    title_mk: { mk: 'Наслов (МК)', en: 'Title (MK)' },
    title_en: { mk: 'Наслов (EN)', en: 'Title (EN)' },
    text_mk: { mk: 'Текст (МК)', en: 'Text (MK)' },
    text_en: { mk: 'Текст (EN)', en: 'Text (EN)' },
    uploadImage: { mk: 'Прикачи слика', en: 'Upload Image' },
    selectLeague: { mk: 'Избери лига', en: 'Select league' },
    publishing: { mk: 'Објавувам...', en: 'Publishing...' },
    uploadingAndPublishing: { mk: 'Се прикачува слика и се објавува...', en: 'Uploading image and publishing...' },
    publishSuccess: { mk: 'Веста е успешно објавена!', en: 'News published successfully!' },
    publishError: { mk: 'Грешка при објавување. Обидете се повторно.', en: 'Error publishing. Please try again.' },
    fillAllFields: { mk: 'Ве молиме пополнете ги сите полиња и прикачете слика.', en: 'Please fill all fields and upload an image.' },
    userIdDisplay: { mk: 'Ваш ID:', en: 'Your ID:' },
    privacyPolicyContent: { 
        mk: `<h3>Политика за приватност</h3>
             <p><strong>Последно ажурирање: 16 јуни 2025</strong></p>
             <p>Веб-страницата Спортико („нас“, „ние“ или „нашата“) ја почитува вашата приватност. Оваа Политика за приватност објаснува како ги собираме, користиме, откриваме и заштитуваме вашите информации кога ја користите нашата веб-страница.</p>
             <h4>1. Собирање на информации</h4>
             <p>Ние собираме информации кои ги давате директно, како и информации кои се собираат автоматски:</p>
             <ul>
                <li><strong>Анонимни кориснички податоци:</strong> За секој корисник се креира единствен, анонимен идентификатор (User ID). За овој ID ги врзуваме вашите преференции како избор на јазик, темен режим, гласови во анкети и избор на омилен тим. Овие податоци не се поврзани со вашето име, е-пошта или други лични информации.</li>
                <li><strong>Податоци за користење:</strong> Автоматски собираме информации за вашата интеракција со страницата, како што се прочитани статии и број на прегледи. Овие податоци се користат за аналитички цели, на пример, за креирање на листата „Најчитани вести“.</li>
                <li><strong>Колачиња (Cookies):</strong> Користиме колачиња за да ја подобриме функционалноста на страницата, како што е зачувување на сесијата и преференциите.</li>
             </ul>
             <h4>2. Употреба на информации</h4>
             <p>Информациите што ги собираме се користат за следниве цели:</p>
             <ul>
                <li>Да го персонализираме вашето искуство.</li>
                <li>Да ја подобриме нашата веб-страница и услуги.</li>
                <li>Да анализираме трендови и да собереме демографски информации.</li>
                <li>Да спречиме измами и да ја осигураме безбедноста на платформата.</li>
             </ul>
             <h4>3. Споделување на информации</h4>
             <p>Ние не ги продаваме, тргуваме или на друг начин пренесуваме вашите лични идентификациски информации на надворешни страни. Можеме да споделиме агрегирани, анонимни податоци со партнери за аналитички цели.</p>
             <h4>4. Вашите права</h4>
             <p>Во согласност со Законот за заштита на личните податоци на Република Северна Македонија, имате право на пристап, исправка и бришење на вашите податоци. Бидејќи податоците што ги чуваме се анонимни, остварувањето на овие права е ограничено. За повеќе информации, ве молиме контактирајте нѐ.</p>
             <h4>5. Контакт</h4>
             <p>Ако имате прашања во врска со оваа Политика за приватност, можете да не контактирате преку контакт информациите достапни на нашата веб-страница.</p>`, 
        en: `<h3>Privacy Policy</h3>
             <p><strong>Last Updated: June 16, 2025</strong></p>
             <p>The Sportico website ("us", "we", or "our") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website.</p>
             <h4>1. Information Collection</h4>
             <p>We collect information you provide directly, as well as information collected automatically:</p>
             <ul>
                <li><strong>Anonymous User Data:</strong> A unique, anonymous identifier (User ID) is created for each user. We associate your preferences with this ID, such as language choice, dark mode, poll votes, and favorite team selection. This data is not linked to your name, email, or other personal information.</li>
                <li><strong>Usage Data:</strong> We automatically collect information about your interaction with the site, such as articles read and view counts. This data is used for analytical purposes, for example, to create the "Most Read News" list.</li>
                <li><strong>Cookies:</strong> We use cookies to improve the site's functionality, such as saving your session and preferences.</li>
             </ul>
             <h4>2. Use of Information</h4>
             <p>The information we collect is used for the following purposes:</p>
             <ul>
                <li>To personalize your experience.</li>
                <li>To improve our website and services.</li>
                <li>To analyze trends and gather demographic information.</li>
                <li>To prevent fraud and ensure the security of the platform.</li>
             </ul>
             <h4>3. Information Sharing</h4>
             <p>We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. We may share aggregated, anonymous data with partners for analytical purposes.</p>
             <h4>4. Your Rights</h4>
             <p>In accordance with the Law on Personal Data Protection of the Republic of North Macedonia, you have the right to access, correct, and delete your data. Since the data we store is anonymous, the exercise of these rights is limited. For more information, please contact us.</p>
             <h4>5. Contact Us</h4>
             <p>If you have any questions about this Privacy Policy, you can contact us via the contact information available on our website.</p>`
    },
    termsOfUseContent: { 
        mk: `<h3>Услови за користење</h3>
             <p><strong>Последно ажурирање: 16 јуни 2025</strong></p>
             <h4>1. Прифаќање на Условите</h4>
             <p>Со пристапување и користење на веб-страницата Спортико, вие прифаќате и се согласувате да бидете обврзани со овие Услови за користење и нашата Политика за приватност. Ако не се согласувате со овие услови, ве молиме да не ја користите страницата.</p>
             <h4>2. Интелектуална сопственост</h4>
             <p>Содржината на оваа веб-страница, вклучувајќи ги текстовите, графиката, логоата и сликите, е сопственост на Спортико и е заштитена со законите за авторски права. Неовластено користење, репродукција или дистрибуција на материјалите е строго забрането.</p>
             <h4>3. Корисничко однесување</h4>
             <p>Вие се согласувате да не ја користите страницата за незаконски цели. Забрането е објавување на содржини што се навредливи, клеветнички или говорат омраза.</p>
             <h4>4. Одрекување од одговорност</h4>
             <p>Содржината на Спортико е обезбедена „како што е“ и е наменета само за информативни цели. Ние не даваме гаранции за точноста, комплетноста или веродостојноста на информациите. Користењето на информациите е на ваш сопствен ризик.</p>
             <h4>5. Ограничување на одговорност</h4>
             <p>Спортико нема да биде одговорен за каква било директна, индиректна, случајна или последична штета што произлегува од вашето користење или неможност за користење на веб-страницата.</p>
             <h4>6. Промени на Условите</h4>
             <p>Го задржуваме правото да ги менуваме или заменуваме овие Услови во секое време. Ваша одговорност е периодично да ги проверувате овие Услови за промени.</p>
             <h4>7. Меродавно право</h4>
             <p>Овие Услови се регулирани и толкувани во согласност со законите на Република Северна Македонија.</p>`, 
        en: `<h3>Terms of Use</h3>
             <p><strong>Last Updated: June 16, 2025</strong></p>
             <h4>1. Acceptance of Terms</h4>
             <p>By accessing and using the Sportico website, you accept and agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree to these terms, please do not use the site.</p>
             <h4>2. Intellectual Property</h4>
             <p>The content on this website, including text, graphics, logos, and images, is the property of Sportico and is protected by copyright laws. Unauthorized use, reproduction, or distribution of the materials is strictly prohibited.</p>
             <h4>3. User Conduct</h4>
             <p>You agree not to use the site for any unlawful purpose. Posting content that is offensive, defamatory, or constitutes hate speech is prohibited.</p>
             <h4>4. Disclaimer of Warranties</h4>
             <p>The content on Sportico is provided "as is" and is for informational purposes only. We make no guarantees about the accuracy, completeness, or reliability of the information. Use of the information is at your own risk.</p>
             <h4>5. Limitation of Liability</h4>
             <p>Sportico will not be liable for any direct, indirect, incidental, or consequential damages arising from your use or inability to use the website.</p>
             <h4>6. Changes to Terms</h4>
             <p>We reserve the right to modify or replace these Terms at any time. It is your responsibility to check these Terms periodically for changes.</p>
             <h4>7. Governing Law</h4>
             <p>These Terms shall be governed and construed in accordance with the laws of the Republic of North Macedonia.</p>` 
    },
    pollOfTheDay: { mk: "Анкета на денот", en: "Poll of the Day" },
    createPoll: { mk: "Креирај Анкета", en: "Create Poll" },
    pollQuestion_mk: { mk: "Прашање на анкета (МК)", en: "Poll Question (MK)" },
    pollQuestion_en: { mk: "Прашање на анкета (EN)", en: "Poll Question (EN)" },
    pollOptions_mk: { mk: "Опции (МК) - една по ред", en: "Options (MK) - one per line" },
    pollOptions_en: { mk: "Опции (EN) - една по ред", en: "Options (EN) - one per line" },
    publishPoll: { mk: "Објави Анкета", en: "Publish Poll" },
    publishingPoll: { mk: "Анкетата се објавува...", en: "Publishing Poll..." },
    pollSuccess: { mk: "Анкетата е успешно објавена!", en: "Poll published successfully!" },
    pollError: { mk: "Грешка при објавување на анкетата.", en: "Error publishing poll." },
    fillPollFields: { mk: "Ве молиме внесете прашање и најмалку две опции.", en: "Please enter a question and at least two options." },
    vote: { mk: "Гласај", en: "Vote" },
    thankYouForVoting: { mk: "Ви благодариме за гласот!", en: "Thank you for your vote!" },
    totalVotes: { mk: "Вкупно гласови:", en: "Total votes:" },
};
const leagueTranslations = {
    'all': { mk: 'Сите', en: 'All' }, 'premier_league': { mk: 'Премиер Лига', en: 'Premier League' }, 'la_liga': { mk: 'Ла Лига', en: 'La Liga' }, 'serie_a': { mk: 'Серија А', en: 'Serie A' }, 'bundesliga': { mk: 'Бундеслига', en: 'Bundesliga' }, 'ligue_1': { mk: 'Лига 1', en: 'Ligue 1' }, 'primeira_liga': { mk: 'Португалска лига', en: 'Primeira Liga' }, 'eredivisie': { mk: 'Ередивизие', en: 'Eredivisie' }, 'champions_league': { mk: 'Лига на шампиони', en: 'Champions League' }, 'european_championship': { mk: 'Европско првенство', en: 'European Championship' }, 'world_cup': { mk: 'Светско првенство', en: 'World Cup' }, 'other_competitions': { mk: 'Останати натпреварувања', en: 'Other Competitions' },
};
const LanguageContext = createContext();
const useLanguage = () => useContext(LanguageContext);
const LanguageProvider = ({ children, initialUserId }) => {
    const [language, setLanguage] = useState('mk');
    useEffect(() => {
        if (!initialUserId || !db) return;
        const profileRef = doc(db, `/artifacts/${appId}/users/${initialUserId}/userProfile`, 'main');
        const unsub = onSnapshot(profileRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().language) setLanguage(docSnap.data().language);
        });
        return () => unsub();
    }, [initialUserId]);
    const handleSetLanguage = (lang) => {
        setLanguage(lang);
        if (initialUserId && db) {
            const profileRef = doc(db, `/artifacts/${appId}/users/${initialUserId}/userProfile`, 'main');
            setDoc(profileRef, { language: lang }, { merge: true }).catch(console.error);
        }
    };
    const t = (key) => translations[key]?.[language] || key;
    const t_league = (key) => leagueTranslations[key]?.[language] || key;
    return <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, t_league }}>{children}</LanguageContext.Provider>;
};


// =================================================================================================
// === 3. СТАТИЧКИ ПОДАТОЦИ И КОНСТАНТИ ============================================================
// =================================================================================================
const initialNews = [ { league_key: 'premier_league', image: 'https://images.unsplash.com/photo-1618283492837-1495d4d3331b?q=80&w=2070&auto=format&fit=crop', title: 'Сити ја освои титулата во Премиер Лигата по драматична завршница', text: 'Манчестер Сити ја освои четвртата последователна титула во Премиер Лигата откако го победи Вест Хем со 3-1 во последниот ден од сезоната.', title_en: 'City win Premier League title after dramatic finish', text_en: 'Manchester City have won a historic fourth straight Premier League title after beating West Ham 3-1 on the final day of the season.' }, { league_key: 'premier_league', image: 'https://images.unsplash.com/photo-1518934523714-164a38096f24?q=80&w=2070&auto=format&fit=crop', title: 'Ливерпул го објави новиот рекорден трансфер', text: 'Ливерпул ги сруши сите рекорди со доведувањето на новиот напаѓач од Бенфика за сума од над 100 милиони евра.', title_en: 'Liverpool announce new record transfer', text_en: 'Liverpool have broken all records with the signing of the new striker from Benfica for a fee of over 100 million euros.' }, { league_key: 'premier_league', image: 'https://images.unsplash.com/photo-1598256925207-1c3f905c1ab2?q=80&w=2070&auto=format&fit=crop', title: 'Ѕвездата на Арсенал ја освои наградата за млад играч на годината', text: 'Младиот талент на Арсенал беше прогласен за најдобар млад играч во Премиер Лигата по импресивната дебитантска сезона.', title_en: 'Arsenal star wins Young Player of the Year award', text_en: 'Arsenal\'s young talent has been named the Premier League\'s best young player after an impressive debut season.' }, { league_key: 'la_liga', image: 'https://images.unsplash.com/photo-1550937635-644a4a8c9837?q=80&w=1932&auto=format&fit=crop', title: 'Реал Мадрид победи во „Ел Класико“ со гол во последната минута', text: 'Џуд Белингем постигна гол во судиското надополнување за да му донесе победа на Реал Мадрид од 2-1 против Барселона.', title_en: 'Real Madrid wins "El Clásico" with a last-minute goal', text_en: 'Jude Bellingham scored in stoppage time to give Real Madrid a 2-1 victory over Barcelona.' }, { league_key: 'la_liga', image: 'https://images.unsplash.com/photo-1606165845588-44d6de8f117a?q=80&w=2070&auto=format&fit=crop', title: 'Финансиските проблеми на Барселона продолжуваат', text: 'Барселона се соочува со нови предизвици откако Ла Лига воведе построги финансиски правила за следната сезона.', title_en: 'Barcelona\'s financial troubles continue', text_en: 'Barcelona faces new challenges after La Liga introduced stricter financial rules for next season.' }, { league_key: 'la_liga', image: 'https://images.unsplash.com/photo-1594314493922-9991a457c126?q=80&w=2070&auto=format&fit=crop', title: 'Атлетико Мадрид ја засили одбраната со нов дефанзивец', text: 'Диего Симеоне го доби посакуваното засилување во одбраната, потпишувајќи со искусен стопер од Серија А.', title_en: 'Atlético Madrid strengthens defense with a new defender', text_en: 'Diego Simeone got his desired reinforcement in defense, signing an experienced center-back from Serie A.' },  { league_key: 'serie_a', image: 'https://images.unsplash.com/photo-1588821321528-9d414a38c4a1?q=80&w=2070&auto=format&fit=crop', title: 'Интер е новиот шампион на Италија', text: 'Интер го обезбеди своето 20-то Скудето по доминантна сезона, завршувајќи далеку пред градскиот ривал Милан.', title_en: 'Inter are the new champions of Italy', text_en: 'Inter secured their 20th Scudetto after a dominant season, finishing well ahead of city rivals AC Milan.' }, { league_key: 'serie_a', image: 'https://images.unsplash.com/photo-1519782235-5135158a1012?q=80&w=2070&auto=format&fit=crop', title: 'Јувентус именуваше нов тренер по разочарувачката сезона', text: '„Старата дама“ го назначи Тиаго Мота за нов предводник, со надеж за враќање на успесите во домашниот шампионат.', title_en: 'Juventus appoints new manager after a disappointing season', text_en: 'The "Old Lady" has appointed Thiago Motta as their new head coach, hoping for a return to domestic success.' }, { league_key: 'serie_a', image: 'https://images.unsplash.com/photo-1620027733285-b042918805f1?q=80&w=2064&auto=format&fit=crop', title: 'Приказната за кам-бекот на Милан ги инспирира навивачите', text: 'Од средината на табелата до борба за второто место, Милан прикажа неверојатен карактер во вториот дел од сезоната.', title_en: 'Milan\'s comeback story inspires fans', text_en: 'From mid-table to fighting for second place, AC Milan showed incredible character in the second half of the season.' }, { league_key: 'bundesliga', image: 'https://images.unsplash.com/photo-1593341643444-84b42b43b44b?q=80&w=1951&auto=format&fit=crop', title: 'Баерн Минхен повторно доминантен во Бундеслигата', text: 'Баварците ја освоија 12-тата последователна титула во Бундеслигата, поставувајќи нови рекорди во процесот.', title_en: 'Bayern Munich dominant again in the Bundesliga', text_en: 'The Bavarians have won their 12th consecutive Bundesliga title, setting new records in the process.' }, { league_key: 'bundesliga', image: 'https://images.unsplash.com/photo-1556228720-195967272a80?q=80&w=1974&auto=format&fit=crop', title: '„Вундеркиндот“ на Дортмунд блеска на големата сцена', text: 'Младиот напаѓач на Борусија Дортмунд го привлече вниманието на цела Европа со своите неверојатни настапи и голови.', title_en: 'Dortmund\'s wonderkid shines on the big stage', text_en: 'Borussia Dortmund\'s young striker has attracted the attention of all of Europe with his incredible performances and goals.' }, { league_key: 'bundesliga', image: 'https://images.unsplash.com/photo-1616428723389-491c3c788647?q=80&w=1974&auto=format&fit=crop', title: 'Изненадувачкиот поход на Лајпциг во купот', text: 'РБ Лајпциг стигна до финалето на германскиот куп, елиминирајќи неколку фаворити на својот пат.', title_en: 'Leipzig\'s surprising cup run', text_en: 'RB Leipzig has reached the final of the German Cup, eliminating several favorites along the way.' }, { league_key: 'ligue_1', image: 'https://images.unsplash.com/photo-1568899464604-d4a13f6390a8?q=80&w=1974&auto=format&fit=crop', title: 'ПСЖ обезбеди уште една титула во Лига 1', text: 'И покрај заминувањето на неколку ѕвезди, ПСЖ лесно стигна до нова титула во францускиот шампионат.', title_en: 'PSG secures another Ligue 1 title', text_en: 'Despite the departure of several stars, PSG easily secured another title in the French championship.' }, { league_key: 'ligue_1', image: 'https://images.unsplash.com/photo-1613045330336-d87082ac53c6?q=80&w=1974&auto=format&fit=crop', title: 'Академијата на Монако произведува нови таленти', text: 'Монако повторно докажа дека е една од најдобрите академии во светот, промовирајќи неколку млади играчи во првиот тим.', title_en: 'Monaco\'s academy produces new talent', text_en: 'Monaco has once again proven to be one of the best academies in the world, promoting several young players to the first team.' }, { league_key: 'ligue_1', image: 'https://images.unsplash.com/photo-1605338292896-4183a54b3e64?q=80&w=2070&auto=format&fit=crop', title: 'Навивачите на Марсеј создадоа неверојатна атмосфера на „Велодром“', text: 'Навивачите на Олимпик Марсеј уште еднаш покажаа зошто се сметаат за едни од најстраствените во Европа.', title_en: 'Marseille fans created an incredible atmosphere at the "Vélodrome"', text_en: 'Olympique Marseille fans once again showed why they are considered among the most passionate in Europe.' },  { league_key: 'primeira_liga', image: 'https://images.unsplash.com/photo-1555928810-332924548a43?q=80&w=2070&auto=format&fit=crop', title: 'Дербито меѓу Порто и Бенфика заврши без победник', text: 'Големото португалско дерби заврши со резултат 2-2, оставајќи ја трката за титулата целосно отворена.', title_en: 'The derby between Porto and Benfica ended without a winner', text_en: 'The great Portuguese derby ended in a 2-2 draw, leaving the title race wide open.' }, { league_key: 'primeira_liga', image: 'https://images.unsplash.com/photo-1599586120428-7a524c582285?q=80&w=2070&auto=format&fit=crop', title: 'Импресивната сезона на Спортинг Лисабон', text: 'Спортинг продолжува со одличните игри, забележувајќи победи и во домашниот шампионат и во Европа.', title_en: 'Sporting Lisbon\'s impressive season', text_en: 'Sporting continues its excellent performances, recording victories both in the domestic championship and in Europe.' }, { league_key: 'primeira_liga', image: 'https://images.unsplash.com/photo-1587609809939-f4327a316a0c?q=80&w=2070&auto=format&fit=crop', title: 'Брага се квалификуваше за европските натпреварувања', text: 'Со победата во последното коло, Брага обезбеди место во групната фаза од Лига Европа за следната сезона.', title_en: 'Braga qualifies for European competitions', text_en: 'With a victory in the final round, Braga secured a spot in the Europa League group stage for next season.' },  { league_key: 'eredivisie', image: 'https://images.unsplash.com/photo-1616588124159-83562a759a22?q=80&w=1932&auto=format&fit=crop', title: 'Напаѓачкиот фудбал на Ајакс добива пофалби низ Европа', text: 'Ајакс од Амстердам повторно игра атрактивен и ефикасен фудбал, што им носи многу симпатии од фудбалските фанови.', title_en: 'Ajax\'s attacking football is praised across Europe', text_en: 'Ajax Amsterdam is once again playing attractive and efficient football, which is winning them much sympathy from football fans.' }, { league_key: 'eredivisie', image: 'https://images.unsplash.com/photo-1628178129596-9915d3d4924c?q=80&w=2070&auto=format&fit=crop', title: 'ПСВ Ајндховен го предизвикува Ајакс за титулата', text: 'Тимот од Ајндховен е главен конкурент на Ајакс во борбата за титулата во холандското првенство оваа сезона.', title_en: 'PSV Eindhoven challenges Ajax for the title', text_en: 'The team from Eindhoven is Ajax\'s main competitor in the fight for the Dutch championship title this season.' }, { league_key: 'eredivisie', image: 'https://images.unsplash.com/photo-1618520217933-85e7915578a1?q=80&w=2070&auto=format&fit=crop', title: 'Историска победа за Феенорд во „Де Класикер“', text: 'Феенорд го победи Ајакс со убедливи 4-0 во најголемото холандско дерби, нанесувајќи му тежок пораз на ривалот.', title_en: 'Historic victory for Feyenoord in "De Klassieker"', text_en: 'Feyenoord defeated Ajax with a convincing 4-0 in the biggest Dutch derby, inflicting a heavy defeat on their rival.' },  { league_key: 'champions_league', image: 'https://images.unsplash.com/photo-1551958214-2d5b3943c7a4?q=80&w=2070&auto=format&fit=crop', title: 'Драматичното финале во Лигата на шампионите одлучено на пенали', text: 'По 120 минути игра без голови, новиот европски шампион беше одлучен по изведувањето на пенали.', title_en: 'Dramatic Champions League final decided on penalties', text_en: 'After 120 minutes of goalless football, the new European champion was decided after a penalty shootout.' }, { league_key: 'champions_league', image: 'https://images.unsplash.com/photo-1628854832599-22a425a72387?q=80&w=2070&auto=format&fit=crop', title: 'Тим-изненадување стигна до полуфиналето', text: 'Екипа за која никој не предвидуваше успех, успеа да се пласира меѓу најдобрите четири екипи во Европа.', title_en: 'Surprise team reaches the semi-finals', text_en: 'A team that no one predicted would succeed managed to place among the top four teams in Europe.' }, { league_key: 'champions_league', image: 'https://images.unsplash.com/photo-1508098682722-e91ddc74b1e2?q=80&w=2070&auto=format&fit=crop', title: 'Најдобриот стрелец сруши долгогодишен рекорд', text: 'Напаѓачот на Баерн Минхен го надмина рекордот на Раул за најмногу голови во нокаут фазата од натпреварувањето.', title_en: 'Top scorer breaks a long-standing record', text_en: 'The Bayern Munich striker surpassed Raul\'s record for the most goals in the knockout stage of the competition.' },  { league_key: 'european_championship', image: 'https://images.unsplash.com/photo-1623862208518-e9fcf42258ce?q=80&w=2070&auto=format&fit=crop', title: 'Италија е новиот Европски шампион!', text: 'Италија го освои Европското првенство по драматичното финале и изведувањето на пенали против Англија на Вембли.', title_en: 'Italy is the new European Champion!', text_en: 'Italy won the European Championship after a dramatic final and a penalty shootout against England at Wembley.' }, { league_key: 'european_championship', image: 'https://images.unsplash.com/photo-1594495893623-23a2d596ee97?q=80&w=2070&auto=format&fit=crop', title: 'Млад талент блесна на Европското првенство', text: '18-годишниот играч за врска на Шпанија беше прогласен за најдобар млад играч на турнирот, привлекувајќи го вниманието на најголемите клубови.', title_en: 'Young talent shines at the European Championship', text_en: 'Spain\'s 18-year-old midfielder was named the tournament\'s best young player, attracting the attention of top clubs.' }, { league_key: 'european_championship', image: 'https://images.unsplash.com/photo-1623862442583-e18e0a8b1a2a?q=80&w=2070&auto=format&fit=crop', title: 'Рекорден број на голови на првенството', text: 'Овогодинешното Европско првенство беше најефикасното во историјата, со просек од над 2.5 гола по натпревар.', title_en: 'Record number of goals at the championship', text_en: 'This year\'s European Championship was the most efficient in history, with an average of over 2.5 goals per match.' }, { league_key: 'world_cup', image: 'https://images.unsplash.com/photo-1553775282-20af807197e3?q=80&w=2070&auto=format&fit=crop', title: 'Аргентина повторно го освои Светското првенство', text: 'Предводена од Лионел Меси, Аргентина ја освои својата трета светска титула по незаборавното финале против Франција.', title_en: 'Argentina wins the World Cup again', text_en: 'Led by Lionel Messi, Argentina won their third world title after an unforgettable final against France.' }, { league_key: 'world_cup', image: 'https://images.unsplash.com/photo-1549420016-0417f73587b9?q=80&w=2070&auto=format&fit=crop', title: 'Земјата-домаќин ги надмина очекувањата', text: 'Мароко испиша историја станувајќи првата африканска нација која стигна до полуфиналето на Светското првенство.', title_en: 'Host nation exceeds expectations', text_en: 'Morocco made history by becoming the first African nation to reach the World Cup semi-finals.' }, { league_key: 'world_cup', image: 'https://images.unsplash.com/photo-1627741692153-a336034c4424?q=80&w=2070&auto=format&fit=crop', title: 'Воведена е нова технологија за судење', text: 'Полу-автоматизираниот офсајд систем беше успешно имплементиран, намалувајќи го времето за донесување одлуки.', title_en: 'New officiating technology introduced', text_en: 'The semi-automated offside system was successfully implemented, reducing decision-making time.' }, { league_key: 'other_competitions', image: 'https://images.unsplash.com/photo-1615928172931-993d56e7e4a7?q=80&w=2070&auto=format&fit=crop', title: 'Бока Јуниорс го освои Копа Либертадорес', text: 'Во страсно финале одиграно во Буенос Аирес, Бока Јуниорс го победи својот лут ривал Ривер Плејт и ја освои титулата во Копа Либертадорес.', title_en: 'Boca Juniors wins the Copa Libertadores', text_en: 'In a passionate final played in Buenos Aires, Boca Juniors defeated their fierce rival River Plate to win the Copa Libertadores title.' }, { league_key: 'other_competitions', image: 'https://images.unsplash.com/photo-1627844641934-8e1f0e47c0f1?q=80&w=2070&auto=format&fit=crop', title: 'Ал-Хилал доминантен во Азиската Лига на шампиони', text: 'Саудискиот гигант Ал-Хилал ја потврди својата доминација во азискиот фудбал со убедлива победа во финалето на Азиската Лига на шампиони.', title_en: 'Al-Hilal dominant in the AFC Champions League', text_en: 'Saudi giant Al-Hilal confirmed its dominance in Asian football with a convincing victory in the AFC Champions League final.' }, ];
const leagueKeys = Object.keys(leagueTranslations);
const topTeams = ["Real Madrid", "Barcelona", "Manchester United", "Liverpool", "Bayern Munich", "Juventus", "Paris Saint-Germain", "Chelsea", "Manchester City", "Arsenal", "AC Milan", "Inter Milan", "Borussia Dortmund", "Atletico Madrid", "Tottenham Hotspur", "Ajax", "Benfica", "Porto", "Napoli", "AS Roma"];
const mainDesktopLeagueKeys = ['all', 'premier_league', 'la_liga', 'serie_a', 'bundesliga'];
const otherLeagueKeys = ['ligue_1', 'primeira_liga', 'eredivisie', 'champions_league', 'european_championship', 'world_cup', 'other_competitions'];
const quotes = [ { mk: "Фудбалот е проста игра. Дваесет и двајца мажи трчаат по топката 90 минути, и на крај Германците победуваат.", en: "Football is a simple game. Twenty-two men chase a ball for 90 minutes and at the end, the Germans always win." }, { mk: "Некои луѓе мислат дека фудбалот е прашање на живот и смрт... Можам да ве уверам дека е многу, многу поважен од тоа.", en: "Some people believe football is a matter of life and death... I can assure you it is much, much more important than that." }, ];
const quizzes = [ { id: 1, question: { mk: "Кој тим има најмногу титули во Лигата на шампионите?", en: "Which team has the most Champions League titles?" }, answers: [{ mk: "Милан", en: "AC Milan" }, { mk: "Баерн Минхен", en: "Bayern Munich" }, { mk: "Ливерпул", en: "Liverpool" }, { mk: "Реал Мадрид", en: "Real Madrid" }], correctAnswerIndex: 3 }, ];


// =================================================================================================
// === 4. ПОМОШНИ ФУНКЦИИ И ИКОНИ ==================================================================
// =================================================================================================
const formatDate = (timestamp, lang) => { if (!timestamp?.toDate) return ''; const locale = lang === 'mk' ? 'mk-MK' : 'en-US'; return timestamp.toDate().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }); };
const getWeekId = (now = new Date()) => { const cetOffsetMilliseconds = 2 * 60 * 60 * 1000; const localOffsetMilliseconds = now.getTimezoneOffset() * 60 * 1000; const cetDate = new Date(now.getTime() + cetOffsetMilliseconds + localOffsetMilliseconds); const dayOfWeek = cetDate.getUTCDay(); const hour = cetDate.getUTCHours(); let daysToSubtract = (dayOfWeek - 4 + 7) % 7; if (dayOfWeek === 4 && hour < 12) { daysToSubtract += 7; } const weekStartDate = new Date(cetDate); weekStartDate.setUTCDate(cetDate.getUTCDate() - daysToSubtract); const year = weekStartDate.getUTCFullYear(); const month = String(weekStartDate.getUTCMonth() + 1).padStart(2, '0'); const day = String(weekStartDate.getUTCDate()).padStart(2, '0'); return `${year}-${month}-${day}`; };

const SporticoLogoIcon = ({ cN }) => <svg className={cN} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" fill="currentColor" opacity="0.1" stroke="none"/><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 4V20"/><circle cx="12" cy="12" r="3"/><path d="M2 9H6V15H2"/><path d="M22 9H18V15H22"/></g></svg>;
const EyeIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
const SearchIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const SunIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
const MoonIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
const FacebookIcon = ({cN}) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
const XIcon = ({cN}) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
const InstagramIcon = ({cN}) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>;
const ArrowLeftIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>;
const LinkIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/></svg>;
const ChevronDownIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
const CalendarIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const AlertTriangleIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>;
const BookmarkIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>;
const PlusCircleIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
const CheckIcon = ({ cN }) => <svg xmlns="http://www.w3.org/2000/svg" className={cN} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;


// =================================================================================================
// === 5. UI КОМПОНЕНТИ ============================================================================
// =================================================================================================
const Card = memo(({ children, className = '' }) => <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden transition-shadow duration-300 hover:shadow-xl ${className}`}>{children}</div>);
const CardContent = memo(({ children, className = '' }) => <div className={`p-4 sm:p-5 lg:p-6 ${className}`}>{children}</div>);
const Button = memo(({ children, onClick, variant = 'default', className = '', disabled = false }) => { const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center'; const variants = { default: 'bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-500 focus-visible:ring-green-500', outline: 'bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 focus-visible:ring-green-500', secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus-visible:ring-gray-400' }; return <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>{children}</button>; });
const Input = React.forwardRef(({ className, ...props }, ref) => <input ref={ref} className={`w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow ${className}`} {...props} />);
Input.displayName = 'Input';
const Textarea = React.forwardRef(({ className, ...props }, ref) => <textarea ref={ref} className={`w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow ${className}`} {...props} />);
Textarea.displayName = 'Textarea';
const LoadingSpinner = memo(({ size = 'md' }) => { const sizes = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' }; return <div className="flex justify-center items-center p-10"><div className={`animate-spin rounded-full border-b-2 border-green-600 ${sizes[size]}`}></div></div>; });
const AdComponent = memo(({ adSlot, className = '' }) => {
    const { t } = useLanguage();
    const adRef = useRef(null);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (AD_SENSE_CLIENT_ID && adRef.current?.offsetParent !== null) {
                try {
                    (window.adsbygoogle = window.adsbygoogle || []).push({});
                } catch (e) {
                    console.error("AdSense Error", e);
                }
            }
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [adSlot]);

    if (!AD_SENSE_CLIENT_ID || AD_SENSE_CLIENT_ID === "ca-pub-XXXXXXXXXXXXXXXX") {
        return (
            <div className={`flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-lg min-h-[100px] text-center p-2 ${className}`}>
                {t('adPlaceholder')}
            </div>
        );
    }
    
    return (
        <div className={className}>
            <ins 
                ref={adRef} 
                className="adsbygoogle" 
                style={{ display: 'block' }} 
                data-ad-client={AD_SENSE_CLIENT_ID} 
                data-ad-slot={adSlot} 
                data-ad-format="auto" 
                data-full-width-responsive="true"
            ></ins>
        </div>
    );
});
const NewsCardSkeleton = memo(() => (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden flex flex-col sm:flex-row">
        <div className="sm:w-1/3 xl:w-2/5 bg-gray-200 dark:bg-gray-700 animate-pulse h-48 sm:h-auto"></div>
        <div className="sm:w-2/3 xl:w-3/5 p-4 sm:p-5 lg:p-6 flex flex-col justify-between">
            <div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse mb-3"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse mb-2"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-4/5 animate-pulse mb-4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse mb-2"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse mb-2"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse"></div>
            </div>
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50"></div>
        </div>
    </div>
));
const Modal = memo(({ isOpen, onClose, title, children }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6 text-center" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">{title}</h3>
                <div className="text-gray-600 dark:text-gray-400 mb-6">{children}</div>
                <Button onClick={onClose}>{t('ok')}</Button>
            </div>
        </div>
    );
});
const HomePageSkeleton = memo(() => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse mb-4"></div>
            <div className="flex flex-wrap gap-2 mb-6">
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
            </div>
             <div className="grid gap-6">
                {[...Array(3)].map((_, i) => <NewsCardSkeleton key={i} />)}
            </div>
        </div>
        <aside className="lg:col-span-4 hidden lg:block">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse mb-4"></div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 space-y-3">
                 {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-start space-x-4 py-2">
                        <div className="h-8 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                        <div className="flex-1 space-y-2">
                             <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse"></div>
                             <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse"></div>
                        </div>
                    </div>
                 ))}
            </div>
        </aside>
    </div>
));


// =================================================================================================
// === 6. ПРИЛАГОДЕНИ КУКИ (CUSTOM HOOKS) ==========================================================
// =================================================================================================
const useAuth = () => {
    const [authStatus, setAuthStatus] = useState({ loading: true, user: null, error: null });
    useEffect(() => {
        if (!auth) {
            setAuthStatus({ loading: false, user: null, error: {code: "INIT_FAILED", message: "Firebase auth not initialized"} });
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setAuthStatus({ loading: false, user: user, error: null });
            } else {
                setAuthStatus(prev => ({ ...prev, loading: true, user: null }));
                (async () => {
                    try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(auth, __initial_auth_token);
                        } else {
                            await signInAnonymously(auth);
                        }
                    } catch (error) {
                         console.error("Critical Sign-In Error:", error);
                         setAuthStatus({ loading: false, user: null, error });
                    }
                })();
            }
        });
        return () => unsubscribe();
    }, []);
    return authStatus;
};
const useUserProfile = (userId) => {
    const [userProfile, setUserProfile] = useState({ darkMode: false, votedPolls: {} });
    useEffect(() => {
        document.documentElement.classList.toggle('dark', userProfile.darkMode);
    }, [userProfile.darkMode]);
    useEffect(() => {
        if (!userId || !db) return;
        const profileRef = doc(db, `/artifacts/${appId}/users/${userId}/userProfile`, 'main');
        const unsub = onSnapshot(profileRef, (docSnap) => {
            const data = docSnap.exists() ? docSnap.data() : {};
            setUserProfile({
                darkMode: data.darkMode || false,
                votedPolls: data.votedPolls || {}
            });
        }, err => console.error("Profile listener failed:", err)); 
        return () => unsub();
    }, [userId]);
    const toggleDarkMode = useCallback(() => {
        const newMode = !userProfile.darkMode;
        setUserProfile(p => ({ ...p, darkMode: newMode }));
        if (userId && db) {
            const profileRef = doc(db, `/artifacts/${appId}/users/${userId}/userProfile`, 'main');
            setDoc(profileRef, { darkMode: newMode }, { merge: true });
        }
    }, [userProfile.darkMode, userId]);
    return { userProfile, toggleDarkMode };
};
const useMostReadNews = () => {
    const [mostRead, setMostRead] = useState([]);
    useEffect(() => {
        if (!db) return;
        const articlesRef = collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`);
        const q = query(articlesRef, orderBy("createdAt", "desc"), limit(50));

        const unsub = onSnapshot(q, (snapshot) => {
            const currentWeekId = getWeekId();
            const newsData = snapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id }))
                .map(article => ({ ...article, currentWeekViews: article.weeklyViews?.[currentWeekId] || 0 }))
                .filter(article => article.currentWeekViews > 0)
                .sort((a, b) => b.currentWeekViews - a.currentWeekViews)
                .slice(0, 5);
            setMostRead(newsData);
        }, (err) => {
            console.error("MostRead listener failed:", err);
        });

        return () => unsub();
    }, []);
    return { mostRead };
}
const useRelatedNews = (currentArticle) => {
    const [relatedNews, setRelatedNews] = useState([]);
    useEffect(() => {
        if (!db || !currentArticle?.id) {
            setRelatedNews([]);
            return;
        };
        const fetchRelated = async () => {
            try {
                const articlesRef = collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`);
                const q = query(
                    articlesRef,
                    where('league_key', '==', currentArticle.league_key)
                );
                const snapshot = await getDocs(q);
                const newsData = snapshot.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
                    .filter(item => item.id !== currentArticle.id)
                    .slice(0, 6);
                setRelatedNews(newsData);
            } catch (err) {
                 console.error("Failed to fetch related news:", err);
            }
        }
        fetchRelated();
    }, [currentArticle]);
    return relatedNews;
}

const usePaginatedNews = (userId, filterKey, debouncedSearchTerm) => {
    const [news, setNews] = useState([]);
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState(null);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const { language } = useLanguage();

    const performInitialWrite = useCallback(async () => {
        if (!db) return;
        const articlesRef = collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`);
        const q = query(articlesRef, limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty && initialNews.length > 0) {
            const batch = writeBatch(db);
            initialNews.forEach(article => {
                const docRef = doc(collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`));
                batch.set(docRef, { ...article, createdAt: serverTimestamp(), views: 0, weeklyViews: {} });
            });
            await batch.commit();
        }
    }, []);

    useEffect(() => {
        if (!userId || !db) return;
        
        const fetchNews = async () => {
            setStatus('loading');
            setNews([]);
            setLastDoc(null);
            setError(null);
            setHasMore(true);

            try {
                await performInitialWrite();
                const articlesRef = collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`);

                if (filterKey !== 'all') {
                    const q = query(articlesRef, where("league_key", "==", filterKey));
                    const querySnapshot = await getDocs(q);
                    let newsData = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                    newsData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

                    if (debouncedSearchTerm) {
                        newsData = newsData.filter(n => {
                            const title = language === 'en' && n.title_en ? n.title_en : n.title;
                            const text = language === 'en' && n.text_en ? n.text_en : n.text;
                            return title?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || 
                                   text?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
                        });
                    }
                    setNews(newsData);
                    setHasMore(false);
                    setLastDoc(null);
                } else {
                    if (debouncedSearchTerm) {
                        const q = query(articlesRef, orderBy("createdAt", "desc"));
                        const querySnapshot = await getDocs(q);
                        const allNews = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        const searchResults = allNews.filter(n => {
                            const title = language === 'en' && n.title_en ? n.title_en : n.title;
                            const text = language === 'en' && n.text_en ? n.text_en : n.text;
                            return title?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || 
                                   text?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
                        });
                        setNews(searchResults);
                        setHasMore(false);
                        setLastDoc(null);
                    } else {
                        const q = query(articlesRef, orderBy("createdAt", "desc"), limit(NEWS_PAGE_SIZE));
                        const querySnapshot = await getDocs(q);
                        const newsData = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        setNews(newsData);
                        setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
                        setHasMore(newsData.length === NEWS_PAGE_SIZE);
                    }
                }
                setStatus('success');
            } catch (err) {
                console.error("News fetch failed:", err);
                setError(err);
                setStatus('error');
            }
        };

        fetchNews();
    }, [userId, filterKey, debouncedSearchTerm, language, performInitialWrite]);

    const fetchMoreNews = useCallback(async () => {
        if (!hasMore || status === 'loading' || filterKey !== 'all' || debouncedSearchTerm || !lastDoc) return;
        
        setStatus('loading');
        try {
            const articlesRef = collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`);
            const q = query(articlesRef, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(NEWS_PAGE_SIZE));
            
            const querySnapshot = await getDocs(q);
            const newNewsData = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            if (newNewsData.length > 0) {
                 setNews(prevNews => [...prevNews, ...newNewsData]);
                 setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
            }
            setHasMore(newNewsData.length === NEWS_PAGE_SIZE);
            setStatus('success');
        } catch (err) {
            console.error("Fetch more news failed:", err);
            setError(err);
            setStatus('error');
        }
    }, [hasMore, status, lastDoc, filterKey, debouncedSearchTerm]);

    return { news, status, error, hasMore, fetchMoreNews };
};


// =================================================================================================
// === 7. КОМПОНЕНТИ НА СТРАНИЦИТЕ И ВИЏЕТИТЕ =======================================================
// =================================================================================================
const Header = memo(({ searchTerm, setSearchTerm, darkMode, onToggleDarkMode, onLogoClick, onBookmarkClick }) => {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchInputRef = useRef(null);
    const { language, setLanguage, t } = useLanguage();
    useEffect(() => { if (isSearchOpen) searchInputRef.current?.focus(); }, [isSearchOpen]);

    return (
        <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg sticky top-0 z-30 border-b border-gray-200 dark:border-gray-800">
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20">
                <div className={`absolute sm:hidden top-0 left-0 w-full h-full flex items-center px-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm transition-opacity duration-300 ${isSearchOpen ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'}`}>
                    <Input ref={searchInputRef} placeholder={t('searchPlaceholderMobile')} className="flex-grow" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <button onClick={() => setIsSearchOpen(false)} className="p-2 ml-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"><svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className={`flex items-center justify-between h-full transition-opacity ${isSearchOpen ? 'opacity-0 sm:opacity-100' : 'opacity-100'}`}>
                    <button onClick={onLogoClick} className="flex items-center gap-2 sm:gap-3 group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded-lg p-1 -ml-1">
                        <SporticoLogoIcon cN="h-9 w-9 sm:h-10 sm:w-10 text-green-600 transition-transform duration-300 group-hover:rotate-6" />
                        <div><h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 tracking-tight transition-colors group-hover:text-green-600 dark:group-hover:text-green-500">Спортико</h1><p className="hidden md:block text-sm text-green-700 dark:text-green-500 font-medium -mt-1">{t('dailyDose')}</p></div>
                    </button>
                    <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <div className="hidden sm:block"><Input placeholder={t('searchPlaceholder')} className="w-52" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/></div>
                        <button onClick={() => setIsSearchOpen(true)} className="sm:hidden p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><SearchIcon cN="w-5 h-5" /></button>
                        <button onClick={() => setLanguage(language === 'mk' ? 'en' : 'mk')} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-semibold text-sm w-10 h-10 flex items-center justify-center"> {language === 'mk' ? 'EN' : 'MK'} </button>
                        <button onClick={onBookmarkClick} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title={t('bookmarkPage')} aria-label={t('bookmarkPage')}><BookmarkIcon cN="w-5 h-5"/></button>
                        <button onClick={onToggleDarkMode} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">{darkMode ? <SunIcon cN="w-5 h-5"/> : <MoonIcon cN="w-5 h-5" />}</button>
                    </div>
                </div>
            </div>
        </header>
    );
});
const Footer = memo(({ onLinkClick, user }) => {
    const { t, t_league } = useLanguage();
    const pageMap = { [t('privacyPolicy')]: 'privacy', [t('termsOfUse')]: 'terms' };
    const legalLinks = [t('privacyPolicy'), t('termsOfUse')];
    const isAdmin = user && ADMIN_UIDS.includes(user.uid);
    
    return (<footer className="bg-gray-800 dark:bg-black/50 text-gray-300">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                <div><h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('mainLeagues')}</h3><ul className="mt-4 space-y-3">{mainDesktopLeagueKeys.slice(1).map(key => (<li key={key}><button onClick={() => onLinkClick('home', key)} className="text-base text-gray-300 hover:text-white transition-colors">{t_league(key)}</button></li>))}</ul></div>
                <div><h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('otherLeagues')}</h3><ul className="mt-4 space-y-3">{otherLeagueKeys.map(key => (<li key={key}><button onClick={() => onLinkClick('home', key)} className="text-base text-gray-300 hover:text-white transition-colors">{t_league(key)}</button></li>))}</ul></div>
                <div><h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('legalInfo')}</h3><ul className="mt-4 space-y-3">{legalLinks.map(item => (<li key={item}><button onClick={() => onLinkClick(pageMap[item])} className="text-base text-gray-300 hover:text-white transition-colors">{item}</button></li>))}</ul></div>
                <div><h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">{t('contact')}</h3><div className="flex mt-4 space-x-5"><a href="#" aria-label="Facebook" className="text-gray-400 hover:text-white transition-colors"><FacebookIcon cN="h-6 w-6" /></a><a href="#" aria-label="X" className="text-gray-400 hover:text-white transition-colors"><XIcon cN="h-6 w-6" /></a><a href="#" aria-label="Instagram" className="text-gray-400 hover:text-white transition-colors"><InstagramIcon cN="h-6 w-6" /></a></div></div>
            </div>
            <div className="mt-12 pt-8 border-t border-gray-700">
                {user && (
                    <div className="text-center mb-6">
                        {isAdmin && (
                             <div className="flex justify-center gap-4 mb-4">
                                <Button onClick={() => onLinkClick('publish')} variant="outline" className="!text-gray-300 hover:!bg-gray-700">
                                    <PlusCircleIcon cN="w-5 h-5"/> {t('publishNews')}
                                </Button>
                                <Button onClick={() => onLinkClick('create_poll')} variant="outline" className="!text-gray-300 hover:!bg-gray-700">
                                    <PlusCircleIcon cN="w-5 h-5"/> {t('createPoll')}
                                </Button>
                             </div>
                        )}
                        <p className="text-xs text-gray-500">{t('userIdDisplay')} <code className="bg-gray-900 p-1 rounded-md">{user.uid}</code></p>
                    </div>
                )}
                <div className="text-center text-sm text-gray-400">
                    <p>&copy; {new Date().getFullYear()} Спортико. {t('copyright')}</p>
                </div>
            </div>
        </div>
    </footer>);
});
const NewsCard = memo(({ item, onClick }) => {
    const { language, t_league } = useLanguage();
    const title = language === 'en' && item.title_en ? item.title_en : item.title;
    const plainText = (item.text || '').replace(/<[^>]+>/g, '');
    const snippet = (language === 'en' && item.text_en) ? (item.text_en || '').replace(/<[^>]+>/g, '') : plainText;
    const leagueName = t_league(item.league_key);
    const imageUrl = item.image ? `${item.image.split('?')[0]}?w=400&q=80&auto=format&fit=crop` : 'https://placehold.co/400x400/cccccc/ffffff?text=Image+Unavailable';

    return (<button onClick={onClick} className="w-full text-left group">
        <Card className="flex flex-col sm:flex-row h-full">
            <div className="sm:w-1/3 xl:w-2/5 overflow-hidden"><img loading="lazy" className="w-full h-48 sm:h-full object-cover transform transition-transform duration-500 group-hover:scale-105" src={imageUrl} alt={title} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/400x400/cccccc/ffffff?text=Image+Unavailable'; }}/></div>
            <div className="sm:w-2/3 xl:w-3/5 flex flex-col">
                <CardContent className="flex-grow">
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">{leagueName}</span>
                    <h3 className="text-lg sm:text-xl font-bold mt-1 mb-2 text-gray-900 dark:text-gray-100 group-hover:text-green-600 transition-colors line-clamp-2">{title}</h3>
                    <p className="text-gray-600 dark:text-gray-400 line-clamp-3 text-sm sm:text-base">{snippet}</p>
                </CardContent>
                <div className="mt-auto px-4 sm:px-5 lg:px-6 pb-4 flex items-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex-wrap gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5"><EyeIcon cN="w-4 h-4"/>{item.views || 0}</span>
                    {item.createdAt && <span className="flex items-center gap-1.5"><CalendarIcon cN="w-4 h-4"/>{formatDate(item.createdAt, language)}</span>}
                </div>
            </div>
        </Card>
    </button>);
});
const RelatedNewsCard = memo(({ item, onClick }) => {
    const { language, t_league } = useLanguage();
    const title = language === 'en' && item.title_en ? item.title_en : item.title;
    const imageUrl = item.image ? `${item.image.split('?')[0]}?w=300&q=80&auto=format&fit=crop` : 'https://placehold.co/300x200/cccccc/ffffff?text=Image+Unavailable';
    return (<button onClick={onClick} className="w-64 sm:w-72 flex-shrink-0 group text-left">
        <Card className="h-full flex flex-col">
            <div className="h-40 overflow-hidden"><img loading="lazy" className="w-full h-full object-cover transform transition-transform duration-500 group-hover:scale-105" src={imageUrl} alt={title} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/300x200/cccccc/ffffff?text=Image+Unavailable'; }}/></div>
            <CardContent className="p-4 flex-grow">
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">{t_league(item.league_key)}</span>
                <h4 className="text-base font-bold mt-1 text-gray-900 dark:text-gray-100 group-hover:text-green-600 transition-colors line-clamp-3">{title}</h4>
            </CardContent>
        </Card>
    </button>);
});
const HomePage = ({ news, status, hasMore, onFetchMore, randomQuote, filterKey, setFilterKey, onSelectArticle, userId, userProfile }) => {
    const { t, t_league, language } = useLanguage();
    return (<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
            <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('latestNews')}</h2>
                <div className="mb-6 hidden lg:flex flex-wrap gap-2">
                    {mainDesktopLeagueKeys.map(key => <Button key={key} onClick={() => setFilterKey(key)} variant={filterKey === key ? "default" : "outline"}>{t_league(key)}</Button>)}
                    <OtherLeaguesDropdown filterKey={filterKey} setFilterKey={setFilterKey} />
                </div>
                <div className="mb-6 lg:hidden grid grid-cols-2 gap-2">
                    <Button onClick={() => setFilterKey('all')} variant={filterKey === 'all' ? "default" : "outline"}>{t_league('all')}</Button>
                    <div className="relative">
                        <select onChange={e => setFilterKey(e.target.value)} value={filterKey} className="w-full h-full px-4 py-2 rounded-lg font-semibold bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500">
                            {leagueKeys.filter(k => k !== 'all').map(key => <option key={key} value={key}>{t_league(key)}</option>)}
                        </select>
                        <ChevronDownIcon cN="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                </div>
                <AdComponent adSlot="0987654321" className="mb-6" />
                <div className="grid gap-6">
                    {news.map((item, index) => (<React.Fragment key={item.id}><NewsCard item={item} onClick={() => onSelectArticle(item)} />{index === 1 && <AdComponent adSlot="1234567890" className="my-4" />}</React.Fragment>))}
                    {status === 'success' && news.length === 0 && <p className="text-center p-8 text-gray-500">{t('noNewsForFilter')}</p>}
                </div>
                {hasMore && status !== 'loading' && <div className="text-center mt-8"><Button onClick={onFetchMore} disabled={status === 'loading'}>{status === 'loading' ? t('loadingMore') : t('showMoreNews')}</Button></div>}
                {status === 'loading' && news.length > 0 && <div className="text-center mt-8"><Button disabled>{t('loadingMore')}</Button></div>}
            </section>
            
            <div className="my-8 lg:hidden">
                <MostReadWidget onSelectArticle={onSelectArticle} />
            </div>

            <div className="my-12 py-8 border-t border-b border-gray-200 dark:border-gray-700"><p className="text-center text-lg md:text-xl italic font-serif text-gray-600 dark:text-gray-400 px-4">"{randomQuote[language]}"</p></div>
            
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FavoriteTeamSelector userId={userId} />
                    <FootballQuiz userId={userId} />
                </div>
                <PollWidget userId={userId} userProfile={userProfile} />
            </div>
        </div>
        <aside className="lg:col-span-4 lg:sticky lg:top-24 h-fit hidden lg:block">
            <MostReadWidget onSelectArticle={onSelectArticle} />
        </aside>
    </div>);
};

const ShareButtons = memo(({ articleUrl, articleTitle }) => {
    const { t } = useLanguage();
    const [copyStatus, setCopyStatus] = useState({ state: 'idle', text: '' });

    const copyToClipboard = useCallback(async (text, feedbackMessage) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.left = "-999999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            setCopyStatus({ state: 'success', text: feedbackMessage });
            setTimeout(() => setCopyStatus({ state: 'idle', text: '' }), 2000);
        } catch (error) {
            console.error('Copy failed', error);
            setCopyStatus({ state: 'error', text: t('copyLinkError') });
            setTimeout(() => setCopyStatus({ state: 'idle', text: '' }), 2000);
        }
    }, [t]);

    const handleInstagramShare = useCallback(() => {
        copyToClipboard(articleUrl, t('instagramStoryHelp'));
        setTimeout(() => {
             window.open('https://www.instagram.com', '_blank');
        }, 500);
    }, [articleUrl, t, copyToClipboard]);
    
    const ShareButton = ({ platform, Icon, onClick, text }) => (
         <div className="relative group">
            <button
                onClick={onClick}
                aria-label={text}
                className="flex items-center justify-center w-full sm:w-auto gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
            >
                <Icon cN="w-5 h-5"/>
                <span className="hidden sm:inline">{text}</span>
            </button>
        </div>
    );

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <h3 className="text-xl font-bold">{t('shareNews')}</h3>
            <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-3 relative">
                <ShareButton platform="facebook" Icon={FacebookIcon} text={t('facebook')} onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`, '_blank')} />
                <ShareButton platform="x" Icon={XIcon} text={t('x')} onClick={() => window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(articleTitle)}`, '_blank')} />
                <ShareButton platform="instagram" Icon={InstagramIcon} text={t('instagram')} onClick={handleInstagramShare} />
                <ShareButton platform="copy" Icon={copyStatus.state === 'success' ? CheckIcon : LinkIcon} text={copyStatus.state === 'success' ? t('copied') : t('copy')} onClick={() => copyToClipboard(articleUrl, t('copyLinkSuccess'))} />
                {copyStatus.text && (
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-md px-2 py-1 transition-opacity duration-300 opacity-100">
                        {copyStatus.text}
                    </div>
                )}
            </div>
        </div>
    );
});

const ArticlePage = ({ article, onSelectArticle, onBack }) => {
    const { t, language, t_league } = useLanguage();
    const articleUrl = window.location.href; 
    const relatedNews = useRelatedNews(article);
    const title = language === 'en' && article.title_en ? article.title_en : article.title;
    const text = (language === 'en' && article.text_en ? article.text_en : article.text) || '';
    const imageUrl = article.image ? `${article.image.split('?')[0]}?w=1200&q=80&auto=format` : 'https://placehold.co/1200x600/cccccc/ffffff?text=Image+Not+Found';

    useEffect(() => {
        if (!article) return;
        const originalTitle = document.title;
        document.title = `${title} | Спортико`;
        return () => { document.title = originalTitle; };
    }, [article, title]);

    return (
        <article className="max-w-4xl mx-auto">
            <Button onClick={onBack} variant="outline" className="mb-6"><ArrowLeftIcon cN="w-5 h-5" /> {t('backToNews')}</Button>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h1>
            <div className="flex items-center flex-wrap text-base sm:text-lg text-gray-500 dark:text-gray-400 mb-6 gap-x-4 sm:gap-x-6 gap-y-2">
                <span>{t('league')}: <span className="font-semibold text-green-600">{t_league(article.league_key)}</span></span>
                <span className="flex items-center gap-1.5"><EyeIcon cN="w-5 h-5" />{article.views || 0} {t('views')}</span>
                {article.createdAt && <span className="flex items-center gap-1.5"><CalendarIcon cN="w-4 h-4" />{formatDate(article.createdAt, language)}</span>}
            </div>
            <img loading="lazy" src={imageUrl} alt={title} className="w-full h-auto max-h-[550px] object-cover rounded-xl mb-6 sm:mb-8 shadow-lg" onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/1200x600/cccccc/ffffff?text=Image+Not+Found'; }}/>
            <div className="prose dark:prose-invert max-w-none text-lg leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }} />
            <hr className="my-10 sm:my-12 dark:border-gray-700"/>
            <ShareButtons articleUrl={articleUrl} articleTitle={title} />
            {relatedNews.length > 0 && (<div className="mt-12 pt-10 border-t dark:border-gray-700"><h3 className="text-2xl font-bold mb-6">{t('relatedNews')}</h3><div className="flex overflow-x-auto space-x-6 pb-4">{relatedNews.map(item => <RelatedNewsCard key={item.id} item={item} onClick={() => onSelectArticle(item)} />)}</div></div>)}
        </article>
    );
};
const PublishNewsPage = ({ onPublishSuccess }) => {
    const { t, t_league } = useLanguage();
    const [formData, setFormData] = useState({ title: '', title_en: '', text: '', text_en: '', league_key: '' });
    const [imageFile, setImageFile] = useState(null);
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const fileInputRef = useRef(null);
    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleFileChange = (e) => { const file = e.target.files?.[0]; if (file) { setImageFile(file); } };
    const handleSubmit = async (e) => {
        e.preventDefault();
        const { title, text, league_key } = formData;
        if (!title || !text || !league_key || !imageFile) { setStatus({ type: 'error', message: t('fillAllFields') }); return; }
        setStatus({ type: 'loading', message: t('uploadingAndPublishing') });
        try {
            const imageRef = ref(storage, `news_images/${Date.now()}_${imageFile.name}`);
            await uploadBytes(imageRef, imageFile);
            const downloadURL = await getDownloadURL(imageRef);
            const articlesRef = collection(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`);
            await addDoc(articlesRef, { ...formData, image: downloadURL, createdAt: serverTimestamp(), views: 0, weeklyViews: {} });
            setStatus({ type: 'success', message: t('publishSuccess') });
            setFormData({ title: '', title_en: '', text: '', text_en: '', league_key: '' });
            setImageFile(null);
            if(fileInputRef.current) fileInputRef.current.value = "";
            setTimeout(() => { onPublishSuccess(); }, 1500);
        } catch (error) {
            console.error("Детална грешка при објавување: ", error);
            setStatus({ type: 'error', message: `${t('publishError')} (${error.code})` });
        }
    };
    return (
        <section className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">{t('publishNews')}</h2>
            <Card>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="title">{t('title_mk')}</label><Input id="title" name="title" value={formData.title} onChange={handleChange} required /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="title_en">{t('title_en')}</label><Input id="title_en" name="title_en" value={formData.title_en} onChange={handleChange} /></div>
                        </div>
                         <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="text">{t('text_mk')}</label><Textarea id="text" name="text" value={formData.text} onChange={handleChange} rows="8" required /></div>
                         <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="text_en">{t('text_en')}</label><Textarea id="text_en" name="text_en" value={formData.text_en} onChange={handleChange} rows="8" /></div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="image">{t('uploadImage')}</label>
                                <Input ref={fileInputRef} id="image" name="image" onChange={handleFileChange} type="file" accept="image/*" required className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 dark:file:bg-green-900/40 file:text-green-700 dark:file:text-green-300 hover:file:bg-green-100 dark:hover:file:bg-green-900/60" />
                                {imageFile && <p className="text-xs text-gray-500 mt-2">Избрана датотека: {imageFile.name}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="league_key">{t('league')}</label>
                                <select id="league_key" name="league_key" value={formData.league_key} onChange={handleChange} required className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                                    <option value="" disabled>{t('selectLeague')}</option>
                                    {leagueKeys.filter(k => k !== 'all').map(key => <option key={key} value={key}>{t_league(key)}</option>)}
                                </select>
                            </div>
                         </div>
                    </CardContent>
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 sm:px-6 flex items-center justify-between">
                         <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{status.message}</p>
                         <Button type="submit" disabled={status.type === 'loading'}>{status.type === 'loading' ? t('publishing') : t('publishArticle')}</Button>
                    </div>
                </form>
            </Card>
        </section>
    );
};
const CreatePollPage = ({ onPublishSuccess }) => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState({ question_mk: '', question_en: '', options_mk: '', options_en: '' });
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({...prev, [name]: value})); };
    const handleSubmit = async (e) => {
        e.preventDefault();
        const options_mk = formData.options_mk.split('\n').filter(opt => opt.trim() !== '');
        const options_en = formData.options_en.split('\n').filter(opt => opt.trim() !== '');
        if (!formData.question_mk || options_mk.length < 2) {
            setStatus({ type: 'error', message: t('fillPollFields') });
            return;
        }
        setStatus({ type: 'loading', message: t('publishingPoll') });
        try {
            await runTransaction(db, async (transaction) => {
                const pollsRef = collection(db, `/artifacts/${appId}/public/data/${POLL_COLLECTION_NAME}`);
                const q = query(pollsRef, where("isActive", "==", true));
                const activePollsSnapshot = await getDocs(q);
                activePollsSnapshot.forEach(pollDoc => {
                    transaction.update(pollDoc.ref, { isActive: false });
                });
                
                const newPollRef = doc(pollsRef);
                const initialVotes = options_mk.reduce((acc, _, index) => { acc[index] = 0; return acc; }, {});

                transaction.set(newPollRef, {
                    question_mk: formData.question_mk,
                    question_en: formData.question_en,
                    options_mk: options_mk,
                    options_en: options_en.length === options_mk.length ? options_en : options_mk, // Fallback to MK options
                    votes: initialVotes,
                    isActive: true,
                    createdAt: serverTimestamp(),
                });
            });
            setStatus({ type: 'success', message: t('pollSuccess') });
            setFormData({ question_mk: '', question_en: '', options_mk: '', options_en: '' });
            setTimeout(() => { onPublishSuccess(); }, 1500);
        } catch (error) {
            console.error("Грешка при креирање анкета:", error);
            setStatus({ type: 'error', message: t('pollError') });
        }
    };

    return (
        <section className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">{t('createPoll')}</h2>
            <Card>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-6">
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="question_mk">{t('pollQuestion_mk')}</label><Input id="question_mk" name="question_mk" value={formData.question_mk} onChange={handleChange} required /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="question_en">{t('pollQuestion_en')}</label><Input id="question_en" name="question_en" value={formData.question_en} onChange={handleChange} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="options_mk">{t('pollOptions_mk')}</label><Textarea id="options_mk" name="options_mk" value={formData.options_mk} onChange={handleChange} rows="4" required /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="options_en">{t('pollOptions_en')}</label><Textarea id="options_en" name="options_en" value={formData.options_en} onChange={handleChange} rows="4" /></div>
                    </CardContent>
                    <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 sm:px-6 flex items-center justify-between">
                         <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{status.message}</p>
                         <Button type="submit" disabled={status.type === 'loading'}>{status.type === 'loading' ? t('publishingPoll') : t('publishPoll')}</Button>
                    </div>
                </form>
            </Card>
        </section>
    );
};
const LegalPage = ({ titleKey, contentKey }) => {
    const { t } = useLanguage();
    return (
        <section className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">{t(titleKey)}</h2>
            <Card><CardContent><div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: t(contentKey) }}/> </CardContent></Card>
        </section>
    );
};
const PrivacyPolicyPage = () => <LegalPage titleKey="privacyPolicy" contentKey="privacyPolicyContent" />;
const TermsPage = () => <LegalPage titleKey="termsOfUse" contentKey="termsOfUseContent" />;
const CookieBanner = ({ onAccept, onInfoClick }) => { const { t } = useLanguage(); return (<div className="fixed bottom-0 left-0 right-0 bg-gray-800/95 dark:bg-black/95 backdrop-blur-sm text-white p-4 z-50 shadow-2xl"><div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4"><p className="text-sm text-center sm:text-left">{t('cookieMessage')} <button onClick={onInfoClick} className="font-semibold underline hover:text-green-400">{t('learnMore')}</button>.</p><Button onClick={onAccept} className="whitespace-nowrap w-full sm:w-auto">{t('agree')}</Button></div></div>);};
const MostReadWidget = memo(({ onSelectArticle }) => {
    const { t, language, t_league } = useLanguage();
    const { mostRead } = useMostReadNews();

    return (<div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('mostRead')}</h2>
        <Card><CardContent className="p-4"><ul className="divide-y divide-gray-200 dark:divide-gray-700">{mostRead.length > 0 ? mostRead.map((article, index) => { const title = language === 'en' && article.title_en ? article.title_en : article.title; return (<li key={article.id} className="py-3"><button onClick={() => onSelectArticle(article)} className="w-full text-left group flex items-start space-x-4"><span className="text-2xl font-bold text-gray-300 dark:text-gray-600 w-6 text-center">{index + 1}</span><div className="flex-1"><h4 className="font-semibold text-gray-800 dark:text-gray-200 group-hover:text-green-600 transition-colors">{title}</h4><p className="text-sm text-gray-500">{t_league(article.league_key)}</p></div></button></li>);}) : <p className="text-gray-500 p-4 text-center">{t('noPopularNews')}</p>}</ul></CardContent></Card>
    </div>);
});
const FootballQuiz = memo(({ userId }) => {
    const { t, language } = useLanguage();
    const [dailyQuiz, setDailyQuiz] = useState(null);
    const [userAnswerIndex, setUserAnswerIndex] = useState(null);
    useEffect(() => {
        if (!userId) return;
        const setupQuiz = async () => {
            const today = new Date().toDateString();
            const dailyQuizRef = doc(db, `/artifacts/${appId}/public/data/dailyQuiz`, 'current');
            let quizIndex;
            const docSnap = await getDoc(dailyQuizRef);
            if (docSnap.exists() && docSnap.data().date === today) { quizIndex = docSnap.data().quizIndex; } else { quizIndex = Math.floor(Math.random() * quizzes.length); await setDoc(dailyQuizRef, { quizIndex, date: today }); }
            const currentQuiz = quizzes[quizIndex];
            setDailyQuiz(currentQuiz);
            const answerRef = doc(db, `/artifacts/${appId}/users/${userId}/quizAttempts`, String(currentQuiz.id));
            const answerSnap = await getDoc(answerRef);
            if (answerSnap.exists()) { setUserAnswerIndex(answerSnap.data().answerIndex); }
        };
        setupQuiz().catch(console.error);
    }, [userId]);
    const handleAnswer = async (index) => { if (!userId || !dailyQuiz || userAnswerIndex !== null) return; setUserAnswerIndex(index); const answerRef = doc(db, `/artifacts/${appId}/users/${userId}/quizAttempts`, String(dailyQuiz.id)); await setDoc(answerRef, { answerIndex: index }); };
    if (!dailyQuiz) return <Card className="h-full flex items-center justify-center"><LoadingSpinner/></Card>;
    const isAnswered = userAnswerIndex !== null;
    const isCorrect = isAnswered && userAnswerIndex === dailyQuiz.correctAnswerIndex;
    return (<Card className="h-full flex flex-col"><CardContent className="flex-grow flex flex-col"> <h3 className="text-xl font-bold mb-3">{t('quizOfTheDay')}</h3> <p className="text-base font-medium mb-4 flex-grow">{dailyQuiz.question[language]}</p> <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{dailyQuiz.answers.map((ans, index) => <Button key={index} onClick={() => handleAnswer(index)} disabled={isAnswered} variant="secondary" className={`justify-start text-left h-full ${isAnswered && (index === dailyQuiz.correctAnswerIndex ? '!bg-green-100 !text-green-800 ring-2 ring-green-500' : index === userAnswerIndex ? '!bg-red-100 !text-red-800 ring-2 ring-red-500' : 'opacity-60')}`}>{ans[language]}</Button>)}</div> {isAnswered && <p className={`mt-4 font-semibold text-center ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>{isCorrect ? t('correctAnswer') : `${t('incorrectAnswer')} ${dailyQuiz.answers[dailyQuiz.correctAnswerIndex][language]}`}</p>} </CardContent></Card>);
});
const FavoriteTeamSelector = memo(({ userId }) => {
    const { t } = useLanguage();
    const [votes, setVotes] = useState([]);
    const [userVote, setUserVote] = useState(null);
    useEffect(() => { const unsub = onSnapshot(collection(db, `/artifacts/${appId}/public/data/teamVotes`), (snap) => setVotes(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.votes || 0) - (a.votes || 0)))); if (userId) { getDoc(doc(db, `/artifacts/${appId}/users/${userId}/userProfile`, 'main')).then(snap => { if (snap.exists() && snap.data().votedTeam) setUserVote(snap.data().votedTeam); }); } return () => unsub(); }, [userId]);
    const handleVote = async (teamName) => { if (userVote || !userId) return; setUserVote(teamName); try { await runTransaction(db, async t_trans => { const teamDocRef = doc(db, `/artifacts/${appId}/public/data/teamVotes`, teamName); const userVoteRef = doc(db, `/artifacts/${appId}/users/${userId}/userProfile`, 'main'); const teamDoc = await t_trans.get(teamDocRef); const newVotes = (teamDoc.data()?.votes || 0) + 1; t_trans.set(teamDocRef, { name: teamName, votes: newVotes }, { merge: true }); t_trans.set(userVoteRef, { votedTeam: teamName }, { merge: true }); }); } catch (e) { console.error("Vote failed: ", e); setUserVote(null); } };
    return (<Card className="h-full"><CardContent> <h3 className="text-xl font-bold mb-3">{t('favoriteTeam')}</h3> {!userVote ? (<><p className="text-base mb-4">{t('selectFavoriteTeam')}</p><select onChange={e => handleVote(e.target.value)} defaultValue="" className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"><option value="" disabled>{t('selectTeamPrompt')}</option>{topTeams.map(team => <option key={team} value={team}>{team}</option>)}</select></>) : (<><p className="text-base mb-4 text-center">{t('thankYouForVote')}</p><div className="space-y-2 max-h-48 overflow-y-auto pr-2">{votes.map(team => (<div key={team.id} className={`p-2 rounded-lg flex justify-between items-center text-sm ${team.name === userVote ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-gray-700/50'}`}><span className="font-medium">{team.name}</span><span className="font-bold">{team.votes} {t('votesSuffix')}</span></div>))}</div></>)} </CardContent></Card>);
});
const OtherLeaguesDropdown = memo(({ filterKey, setFilterKey }) => {
    const { t, t_league } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    useEffect(() => { const handleClickOutside = e => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); }; document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
    const isOtherLeagueSelected = otherLeagueKeys.includes(filterKey);
    return (<div className="relative" ref={dropdownRef}><Button onClick={() => setIsOpen(p => !p)} variant={isOtherLeagueSelected ? "default" : "outline"} className="w-full sm:w-auto justify-between">{t('otherLeagues')} <ChevronDownIcon cN={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></Button>{isOpen && <div className="absolute top-full mt-2 w-56 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg z-10 py-1"><div className="py-1">{otherLeagueKeys.map(key => <button key={key} onClick={() => { setFilterKey(key); setIsOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm ${filterKey === key ? 'font-semibold text-green-600' : 'text-gray-700 dark:text-gray-300'} hover:bg-gray-100 dark:hover:bg-gray-700`}>{t_league(key)}</button>)}</div></div>}</div>);
});
const PollWidget = memo(({ userId, userProfile }) => {
    const { t, language } = useLanguage();
    const [pollData, setPollData] = useState({ poll: null, loading: true });

    useEffect(() => {
        if (!db) return;
        const pollsRef = collection(db, `/artifacts/${appId}/public/data/${POLL_COLLECTION_NAME}`);
        // FIX: Remove orderBy to avoid composite index. Sorting will be done on the client.
        const q = query(pollsRef, where("isActive", "==", true));
        const unsub = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                setPollData({ poll: null, loading: false });
            } else {
                // Sort client-side to find the most recent poll
                const polls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                polls.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
                const latestPoll = polls[0];
                setPollData({ poll: latestPoll, loading: false });
            }
        }, err => { 
            console.error("Poll listener failed:", err); 
            setPollData({ poll: null, loading: false });
        });
        return () => unsub();
    }, []);

    const handleVote = async (optionIndex) => {
        if (!userId || !pollData.poll) return;
        const pollRef = doc(db, `/artifacts/${appId}/public/data/${POLL_COLLECTION_NAME}`, pollData.poll.id);
        const userProfileRef = doc(db, `/artifacts/${appId}/users/${userId}/userProfile`, 'main');
        
        try {
            await runTransaction(db, async (transaction) => {
                const userProfileSnap = await transaction.get(userProfileRef);
                const currentVotedPolls = userProfileSnap.data()?.votedPolls || {};
                if (currentVotedPolls[pollData.poll.id] !== undefined) return; // Already voted

                transaction.update(pollRef, { [`votes.${optionIndex}`]: increment(1) });
                transaction.set(userProfileRef, { votedPolls: { ...currentVotedPolls, [pollData.poll.id]: optionIndex }}, { merge: true });
            });
        } catch (error) {
            console.error("Error voting:", error);
        }
    };

    if (pollData.loading) return <Card><CardContent><LoadingSpinner /></CardContent></Card>;
    if (!pollData.poll) return null; // Don't render anything if there's no active poll

    const { poll } = pollData;
    const userVoteIndex = userProfile.votedPolls?.[poll.id];
    const hasVoted = userVoteIndex !== undefined;

    const question = language === 'en' && poll.question_en ? poll.question_en : poll.question_mk;
    const options = language === 'en' && poll.options_en?.length === poll.options_mk?.length ? poll.options_en : poll.options_mk;
    
    const totalVotes = Object.values(poll.votes || {}).reduce((sum, count) => sum + count, 0);

    return (
        <Card>
            <CardContent>
                <h3 className="text-xl font-bold mb-4">{t('pollOfTheDay')}</h3>
                <p className="text-lg font-medium mb-5">{question}</p>
                <div className="space-y-3">
                    {options.map((option, index) => {
                        if (hasVoted) {
                            const voteCount = poll.votes[index] || 0;
                            const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(1) : 0;
                            return (
                                <div key={index} className="relative overflow-hidden rounded-lg p-3 text-left bg-gray-100 dark:bg-gray-700/60">
                                    <div className={`absolute top-0 left-0 h-full bg-green-200 dark:bg-green-800/50 transition-all duration-500 ${userVoteIndex === index ? 'ring-2 ring-green-500 z-10 rounded-lg' : ''}`} style={{ width: `${percentage}%` }}></div>
                                    <div className="relative z-20 flex justify-between items-center font-medium">
                                        <span>{option}</span>
                                        <span className="text-sm font-bold">{percentage}%</span>
                                    </div>
                                </div>
                            );
                        } else {
                            return <Button key={index} onClick={() => handleVote(index)} variant="secondary" className="w-full !justify-start">{option}</Button>;
                        }
                    })}
                </div>
                {hasVoted && <p className="text-right text-sm font-semibold text-gray-500 mt-4">{t('totalVotes')} {totalVotes}</p>}
            </CardContent>
        </Card>
    );
});
const LazyHomePage = lazy(() => Promise.resolve({ default: HomePage }));
const LazyArticlePage = lazy(() => Promise.resolve({ default: ArticlePage }));
const LazyPrivacyPolicyPage = lazy(() => Promise.resolve({ default: PrivacyPolicyPage }));
const LazyTermsPage = lazy(() => Promise.resolve({ default: TermsPage }));
const LazyPublishNewsPage = lazy(() => Promise.resolve({ default: PublishNewsPage }));
const LazyCreatePollPage = lazy(() => Promise.resolve({ default: CreatePollPage }));


// =================================================================================================
// === 8. ГЛАВНА ЛОГИКА НА АПЛИКАЦИЈАТА (`AppContent`) ===============================================
// =================================================================================================
function AppContent({ user, userProfile, toggleDarkMode }) {
    const { t } = useLanguage();
    const [page, setPage] = useState({ name: 'home', filterKey: 'all' });
    const [selectedArticle, setSelectedArticle] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
    const [randomQuote, setRandomQuote] = useState(quotes[0]);
    const [showCookieBanner, setShowCookieBanner] = useState(false);
    const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
    const scrollPositionRef = useRef(0);
    const { news, status: newsStatus, error: newsError, hasMore, fetchMoreNews } = usePaginatedNews(user?.uid, page.filterKey, debouncedSearchTerm);

    const handleSetPage = useCallback((name, key) => { scrollPositionRef.current = window.scrollY; setSelectedArticle(null); setPage({ name, filterKey: key || 'all' }); window.scrollTo(0,0); }, []);
    useEffect(() => { const timerId = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300); return () => clearTimeout(timerId); }, [searchTerm]);
    useEffect(() => { setShowCookieBanner(localStorage.getItem('cookiesAccepted') !== 'true'); const quoteInterval = setInterval(() => setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)]), 15000); return () => clearInterval(quoteInterval); }, []);
    useEffect(() => { if (selectedArticle) { window.scrollTo(0, 0); } else { const timer = setTimeout(() => window.scrollTo(0, scrollPositionRef.current), 0); return () => clearTimeout(timer); } }, [selectedArticle]);

    const handleSelectArticle = useCallback(async (article) => { 
        if (!article?.id || !db) return; 
        scrollPositionRef.current = window.scrollY;
        setSelectedArticle(article); 
        const articleRef = doc(db, `/artifacts/${appId}/public/data/${NEWS_COLLECTION_NAME}`, article.id); 
        const currentWeekId = getWeekId();
        try { await updateDoc(articleRef, { views: increment(1), [`weeklyViews.${currentWeekId}`]: increment(1) }); } catch (error) { console.error("Error updating views: ", error); } 
    }, []);

    const renderPage = () => {
        if (newsStatus === 'loading' && news.length === 0) return <HomePageSkeleton />;
        if (newsError) return <div className="min-h-[60vh] flex items-center justify-center"><p className="text-red-500">{t('errorLoadingNews')}</p></div>;
        if (selectedArticle) return <LazyArticlePage article={selectedArticle} onSelectArticle={handleSelectArticle} onBack={() => setSelectedArticle(null)} />;
        
        switch(page.name) {
            case 'privacy': return <LazyPrivacyPolicyPage />;
            case 'terms': return <LazyTermsPage />;
            case 'publish': return <LazyPublishNewsPage onPublishSuccess={() => handleSetPage('home')} />;
            case 'create_poll': return <LazyCreatePollPage onPublishSuccess={() => handleSetPage('home')} />;
            default: return <LazyHomePage news={news} status={newsStatus} hasMore={hasMore} onFetchMore={fetchMoreNews} randomQuote={randomQuote} filterKey={page.filterKey} setFilterKey={(key) => handleSetPage('home', key)} onSelectArticle={handleSelectArticle} userId={user?.uid} userProfile={userProfile} />;
        }
    }

    return (
        <div className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans flex flex-col min-h-screen">
            <Header searchTerm={searchTerm} setSearchTerm={setSearchTerm} darkMode={userProfile.darkMode} onToggleDarkMode={toggleDarkMode} onLogoClick={() => handleSetPage('home', 'all')} onBookmarkClick={() => setIsBookmarkModalOpen(true)} />
            <main className="max-w-7xl mx-auto p-4 sm:px-6 lg:px-8 w-full flex-grow container">
                <Suspense fallback={<HomePageSkeleton />}>{renderPage()}</Suspense>
            </main>
            <AdComponent adSlot="2345678901" className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-8" />
            <Footer onLinkClick={handleSetPage} user={user} />
            {showCookieBanner && <CookieBanner onAccept={() => { localStorage.setItem('cookiesAccepted', 'true'); setShowCookieBanner(false); }} onInfoClick={() => handleSetPage('privacy')} />}
            <Modal isOpen={isBookmarkModalOpen} onClose={() => setIsBookmarkModalOpen(false)} title={t('bookmarkInstructionsTitle')}><p>{t('bookmarkInstructions')}</p></Modal>
        </div>
    );
}


// =================================================================================================
// === 9. ГЛАВНА КОМПОНЕНТА НА АПЛИКАЦИЈАТА (`App`) =================================================
// =================================================================================================
export default function App() {
    const { loading, user, error } = useAuth();
    const { userProfile, toggleDarkMode } = useUserProfile(user?.uid);

    useEffect(() => {
        const scriptId = 'adsense-script';
        if (document.getElementById(scriptId) || !AD_SENSE_CLIENT_ID) { return; }
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_SENSE_CLIENT_ID}`;
        script.async = true;
        script.crossOrigin = "anonymous";
        document.head.appendChild(script);
    }, []);

    if (loading) {
        return <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><HomePageSkeleton /></div>;
    }
    
    if (error) {
         return (
             <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
                <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg max-w-lg">
                    <AlertTriangleIcon cN="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <LanguageProvider initialUserId={null}><AuthErrorDisplay error={error} /></LanguageProvider>
                </div>
            </div>
        );
    }
    
    if (!user) {
         return <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><HomePageSkeleton /></div>;
    }

    return (
        <LanguageProvider initialUserId={user.uid}>
            <AppContent user={user} userProfile={userProfile} toggleDarkMode={toggleDarkMode} />
        </LanguageProvider>
    );
}
const AuthErrorDisplay = ({ error }) => {
    const { t } = useLanguage();
    return (
        <>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">{t('authErrorTitle')}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{t('authErrorCheckConfig')}</p>
            <div className="bg-red-50 dark:bg-gray-700 p-4 rounded-lg text-left">
                <p className="font-mono text-sm text-red-700 dark:text-red-300 break-words">{`${error.code}: ${error.message}`}</p>
            </div>
        </>
    );
};


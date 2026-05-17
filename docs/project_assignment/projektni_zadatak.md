# tikimiki
### Platforma za održavanje i učešće na hakatonima
**Projektni zadatak — Verzija 2.1**

---

## 1. Tim

Članovi tima digitalci:
- Stevan Gnjato (vođa tima)
- Andrej Čolić
- Dimitrije Pešić
- Nenad Skoković

---

## 2. Uvod

### 2.1. Rezime

Projekat tikimiki je deo praktične nastave na predmetu Principi softverskog inženjerstva. Aplikacija je namenjena svima koji učestvuju u organizaciji ili izvođenju hakathona — kako takmičarima koji traže relevantne događaje i saradnike, tako i organizatorima kojima je potreban efikasan alat za upravljanje celim procesom. Platforma uvozi podatke o aktuelnim takmičenjima u realnom vremenu, verifikuje tehničke veštine učesnika putem GitHub integracije i koristi AI za predlaganje optimalnih timova.

### 2.2. Namena dokumenta i ciljna grupa

Ovaj dokument definiše problem koji aplikacija rešava, opis sistema i njegovih funkcionalnosti, vrste korisnika, tehnološki stack, ograničenja i plan budućeg razvoja. Dokument je namenjen svim članovima, kao i klijentu kako bi se definisao sistem i njegova realizacija.

### 2.3. Opis problema

Hakathon ekosistem je trenutno rasut i neorganizovan. Takmičar koji želi da učestvuje mora sam da pronađe odgovarajući događaj, samostalno potraži saradnike i napravi tim, a sve to bez ikakve garancije da će okupiti ljude sa pravim veštinama za konkretan izazov. Profili učesnika su uglavnom samodeklarisani i neverifikovani, što otežava procenu stvarnih tehničkih sposobnosti. Pored toga, učestvovanje na samim događajima takođe nije jednostavno. Takmičaru je potrebno da se navikne na sistem komunikacije i rada koji su definisali organizatori, što često znači snalaženje u nekoliko nepovezanih alata istovremeno. Bez jedinstvene platforme koja objedinjuje te procese, deo energije koji bi trebalo da bude usmeren na sam projekat troši se na organizacionu logistiku.

Organizatori, sa svoje strane, nemaju centralizovan alat za upravljanje prijavama. Selekcija učesnika svodi se na ručni pregled formulara, što je vremenski zahtevno i podložno subjektivnim odlukama. Tokom samog takmičenja nema sistemskog uvida u napredak timova, a po završetku hakathona projekti ostaju bez vidljivosti: bez mehanizma koji bi ih predstavio poslodavcima ili investitorima.

### 2.4. Opis sistema

Hakathon ekosistem danas je rasut i neorganizovan, sa procesima koji su razbijeni kroz više nepovezanih alata i platformi. Tikimiki predstavlja jedinstveno, sveobuhvatno rešenje koje pokriva kompletan životni ciklus jednog hackathona, od njegovog kreiranja i promocije, preko prijava i formiranja timova, pa sve do samog održavanja, praćenja napretka i objavljivanja rezultata.

Za takmičare, platforma eliminiše potrebu za ručnim pretraživanjem događaja i nasumičnim okupljanjem timova. Omogućava centralizovan pregled hackathona i pametno povezivanje učesnika na osnovu verifikovanih veština, iskustva i interesovanja. Profili korisnika pružaju pouzdan uvid u tehničke sposobnosti, što olakšava formiranje kvalitetnih timova. Tokom samog hackathona, komunikacija, organizacija i kolaboracija odvijaju se unutar platforme, bez potrebe za dodatnim alatima, osim GitHub-a i razvojnog okruženja.

Organizatori dobijaju centralizovan alat za upravljanje celim procesom. Kreiranje i promocija događaja, prikupljanje i obrada prijava, kao i selekcija učesnika obavljaju se kroz jedinstven sistem koji smanjuje manuelni rad i subjektivnost. Tokom trajanja hackathona postoji uvid u napredak timova i jasna struktura rada. Po završetku, rezultati se automatski objavljuju, a projekti ostaju vidljivi na platformi, čime se omogućava njihova dalja promocija ka poslodavcima i investitorima.

Platforma tako postaje centralno mesto za ceo hackathon ekosistem i jedini alat koji je potreban uz GitHub i razvojno okruženje, omogućavajući da se fokus prebaci sa organizacione logistike na izgradnju kvalitetnih projekata i timsku saradnju.

---

## 3. Vrste korisnika

### 3.1. Gost

Gost je korisnik koji pristupa platformi bez registracije. Ima mogućnost da pregleda listu nadolazećih hakathona, čita opise događaja, pravila i nagrade i pretražuje i pregleda ostale korisnike. Gost se može registrovati na platformu kao član, organizacija ili admin.

### 3.2. Član

Član je registrovani korisnik platforme sa punim pristupom svim korisničkim funkcionalnostima. Poseduje personalizovan profil koji uključuje korisničko ime, profilnu sliku, opis, istoriju učešća na hakathonima, osvojene bedževe i poene. Može pretraživati i pregledati ostale korisnike, dopisivati se sa njima i prijavljivati se na hakathone.

U zavisnosti od hakathona na kojem učestvuje, član može imati jednu od dve uloge: takmičar ili moderator. Kao takmičar, prijavljuje se na događaj, formira tim i učestvuje u takmičenju. Kao moderator, pomaže u vođenju događaja, upravljanju prijavama i komunikaciji sa učesnicima. Ulogu moderatora dodeljuje organizator hakathona po sopstvenom nahođenju.

Član može aktivirati premium status, koji otključava napredne opcije personalizacije profila kao što su postavljanje animovanih GIF-ova za profilnu sliku i baner, prilagođenu boju korisničkog imena i pristup ekskluzivnim vizuelnim elementima koji nisu dostupni standardnim nalozima. Premium status ne utiče na funkcionalne privilegije unutar hakathona, već je isključivo vezan za izgled i personalizaciju profila.

### 3.3. Organizacija

Organizacija je nalog koji predstavlja kompaniju, instituciju ili grupu koja organizuje hakathone na platformi. Pre nego što stekne pravo kreiranja događaja, nalog organizacije mora proći proces verifikacije od strane administratora sistema, čime se obezbeđuje autentičnost i kredibilitet objavljenih hakathona. Organizacija ima najveće privilegije upravljanja nad hakathonima koje kreira.

Po završetku hakathona, organizacija je obavezna da sistemu dostavi zvanične rezultate takmičara. Na osnovu tih podataka, platforma ažurira profile učesnika tako što dodeljuje poene, bedževe i beleži placement u istoriji hakathona svakog člana.

### 3.4. Administrator

Administrator je korisnik sa najvišim nivoom pristupa u sistemu. Njegova primarna odgovornost je verifikacija organizacija. On pregleda zahteve za registraciju i odlučuje da li će nalog organizacije biti odobren ili odbijen.

U slučaju kršenja pravila, neprikladnog ponašanja ili sporova, administrator ima ovlašćenje da interveniše i preduzme odgovarajuće mere. Ima uvid u sve hakathone i može reagovati ukoliko dođe do nepravilnosti na bilo kom događaju.

Administrator je jedini koji ima pristup sistemskim podešavanjima platforme i praćenju metrika korišćenja sistema.

---

## 4. Funkcionalnosti

### 4.1. Registracija i autentifikacija

Neregistrovani korisnici mogu kreirati nalog popunjavanjem forme sa osnovnim podacima. Podržana je i brza registracija putem GitHub, LinkedIn i Google OAuth servisa, čime se proces svodi na nekoliko klikova. Nalog postaje aktivan nakon potvrde email adrese. Svaki korisnik može u svakom trenutku da se izloguje sa sistema. Registrovane organizacije ne mogu da imaju organizacijske privilegije dok ne budu odobrene od strane administratora.

### 4.2. Verifikacija organizacije

Novokreirani nalog organizacije prolazi kroz proces verifikacije pre nego što stekne pravo objavljivanja hakathona. Zahtev za verifikacijom automatski se prosleđuje administratoru koji pregleda dostavljene podatke i donosi odluku o odobravanju. Organizacija dobija obaveštenje o ishodu verifikacije.

### 4.3. Izmena profila

Svaki član može uređivati sopstveni profil — menjati korisničko ime, lozinku, profilnu sliku, baner i opis. Premium članovi dodatno mogu postaviti animovane GIF-ove za profilnu sliku i baner, kao i izabrati prilagođenu boju korisničkog imena. Profil prikazuje istoriju učešća na hakathonima, osvojene bedževe i ukupan broj poena.

### 4.4. Početna strana

Korisnici imaju pristup personalizovanoj početnoj strani na kojoj se prikazuju objave drugih korisnika, najave hakathona i novosti sa platforme. Svaki registrovani korisnik može postavljati sopstveni sadržaj na feed uključujući tekstualne objave, slike i linkove. Sadržaj se može komentarisati i reagovati na njega.

### 4.5. Pretraga

Platforma nudi objedinjenu pretragu koja pokriva korisnike, organizacije i hakathone. Rezultati se mogu filtrirati po relevantnim kriterijumima, kao na primer: za hakathone po lokaciji, nagradi, tipu i traženim veštinama, a za korisnike po veštinama i istoriji učešća.

### 4.6. Dopisivanje i grupna ćaskanja

Korisnici mogu međusobno komunicirati putem direktnih poruka. Pored toga, podržana su i grupna ćaskanja koja omogućavaju komunikaciju unutar tima ili između više korisnika istovremeno.

### 4.7. Kreiranje i upravljanje hakathonima

Verifikovane organizacije mogu kreirati hakathone definisanjem svih relevantnih detalja — naziva, opisa, izazova, nagrada, vremenskog okvira, maksimalnog broja učesnika i tipa događaja (virtuelni ili fizički). Za fizičke hakathone podržana je integracija sa Google Maps servisom radi preciznog navođenja lokacije. Organizacija tokom trajanja hakathona upravlja prijavama učesnika, dodeljuje uloge moderatora i prati aktivnost timova.

### 4.8. Serveri za komunikaciju

Svakim kreiranjem hakathona automatski se generiše namenski server za komunikaciju unutar platforme. Server dolazi sa predefinisanim kanalima: opštim kanalom, kanalima po timovima i kanalom za obaveštenja organizacije. Organizacija i moderatori upravljaju ovim serverima. Korisnici pristupaju serveru nakon što su primljeni na hackathon.

### 4.9. Integrisani Kanban modul

Svakom timu automatski se generiše interna tabla za upravljanje zadacima unutar njihovog serverskog prostora za komunikaciju. Tabla dolazi sa predefinisanim kolonama koje tim može prilagoditi sopstvenim potrebama. Ovim se eliminiše potreba za eksternim alatima za upravljanje projektom tokom hakathona.

### 4.10. Prijavljivanje na hackathon

Članovi se mogu prijaviti na hakathon direktno sa stranice događaja. Prilikom prijave, korisnik dobija opciju da termin hakathona doda u sopstveni kalendar putem Google Calendar ili Apple Calendar integracije. Status prijave vidljiv je na korisničkom profilu i može biti u stanju čekanja, odobren ili odbijen. Tokom prijave korisnik navodi i članove svog tima ukoliko ih ima.

### 4.11. Odobravanje takmičara

Organizacija pregleda pristigle prijave i odlučuje koje će učesnike primiti na hakathon. Pregled prijava podržan je filterima po veštinama i GitHub aktivnosti kako bi selekcija bila što efikasnija. Podnosilac prijave dobija obaveštenje o odluci organizacije.

### 4.12. AI uparivanje timova

Ukoliko takmičar nema tim, sistem na osnovu verifikovanih GitHub profila učesnika i zahteva konkretnog hakathonskog izazova predlaže optimalne kombinacije timova koje pokrivaju traženi skill set.

### 4.13. Video prezentacija projekta

Timovi mogu direktno otpremiti finalnu video prezentaciju svog projekta na server događaja. Sudije pregledaju prijavljene radove unutar platforme bez potrebe za eksternim servisima. Video ostaje dostupan i nakon završetka hakathona kao deo projektnog portfolija.

### 4.14. Glasanje publike

Hakathoni mogu uključiti opcionalnu nagradu publike. Gostujući korisnici i registrovani članovi mogu glasati za projekte koji im se najviše dopaju tokom trajanja glasanja koje definiše organizator. Rezultati glasanja prikazuju se u realnom vremenu na stranici događaja i uzimaju se u obzir pri dodeli posebne nagrade.

### 4.15. Podnošenje rezultata

Po završetku hakathona, organizacija je obavezna da unese zvanične rezultate takmičara. Na osnovu dostavljenih podataka, sistem automatski ažurira profile učesnika, dodeljuje odgovarajuće poene i bedževe i plasman beleži u istoriji svakog korisnika. Hakathon ostaje označen kao nezavršen sve dok rezultati ne budu dostavljeni.

### 4.16. Sponzorski sistem nagrada

Kompanije sponzori hakathona mogu postavljati specifične pod-izazove unutar glavnog takmičenja, sa zasebnim nagradama za svaki. Na primer, organizator može definisati nagradu za najbolju implementaciju baze podataka ili najkvalitetniji korisnički interfejs. Ovaj sistem motiviše takmičare da posvete posebnu pažnju kvalitetu određenih delova svog rešenja, a sponzorima pruža direktnu vidljivost prema ciljanoj tehničkoj publici.

### 4.17. Sistem bedževa i poena

Platforma automatski dodeljuje bedževe i poene za različita postignuća, kao što su učešće na hakathonu, osvajanje nagrade, formiranje tima, GitHub aktivnost tokom takmičenja i tako dalje. Bedževi i poeni su vidljivi na profilu i ažuriraju se nakon što organizacija dostavi zvanične rezultate takmičenja.

### 4.18. Prijava neprikladnog sadržaja i neregularnosti

Korisnici mogu prijaviti neregularnosti, neprikladne objave, profile ili poruke putem opcije dostupne na svakom sadržaju platforme. Prijava se prosleđuje moderatoru relevantnog hakathona ili direktno administratoru, zavisno od konteksta. Podnosilac prijave dobija povratnu informaciju o preduzetim merama.

### 4.19. Premium status

Član može aktivirati premium status koji otključava napredne opcije personalizacije profila. Aktivacija se vrši putem namenskog ekrana unutar podešavanja naloga. Premium status ima definisan period trajanja nakon kojeg se može obnoviti. Premium korisnicima je dostupno češće igranje mini igara.

### 4.20. Dnevne mini igre i merch store

Platforma nudi dnevne interaktivne mini igre putem kojih članovi mogu osvajati dodatne poene. Skupljeni poeni mogu se zameniti za aktivaciju premium statusa ili zvanični tikimiki™ merch. Igre se osvežavaju svakodnevno i dostupne su svim registrovanim korisnicima nezavisno od učešća na hakathonu.

### 4.21. Nadzor platforme

Administrator ima ovlašćenje da preduzima mere prema nalozima i sadržaju koji krše pravila platforme. U zavisnosti od prirode i težine prekršaja, mere mogu uključivati privremenu suspenziju ili trajno uklanjanje naloga iz sistema. Ovo se podjednako odnosi na obične korisnike, organizacije i njihov sadržaj.

---

## 5. Kvalitet

Potrebno je izvršiti testiranje metodom crne kutije svih gore navedenih funkcionalnosti. Potrebno je izvršiti testiranje kapaciteta i brzine odziva sistema, kao i otpornosti na greške u slučaju većeg broja istovremenih korisnika, što je posebno relevantno tokom aktivnih hakathona kada se očekuje povećano opterećenje platforme.

Takođe, potrebno je posvetiti posebnu pažnju bezbednosti sistema — sprečavanju unosa malicioznog SQL koda koji bi ugrozio bazu podataka, kao i zaštiti korisničkih podataka i OAuth tokena dobijenih putem GitHub, LinkedIn i Google integracija. Real-time komponente sistema, kao što su serveri za komunikaciju i chat funkcionalnost, moraju biti testirane na stabilnost i ispravno ponašanje u slučaju prekida konekcije.

---

## 6. Dizajn platforme

Platforma je dizajnirana sa podrazumevanom tamnom temom koja odražava karakter hakathon kulture, podržavajući noćni rad, intenzivnu atmosferu i tehničku estetiku. Takođe je dostupna i svetla tema. Vizuelni identitet zasnovan je na konzistentnoj paleti boja i tipografiji koja je primenjena kroz sve delove sistema.

Primarna boja platforme je nijansa ljubičaste (`#5F4A8B`), koja se koristi za ključne elemente interfejsa. Kao akcentna boja koristi se zlatno-žuta (`#EDD94B`) koja predstavlja sekundarnu boju. Pozadina je tamna sa blagim ljubičastim podtonom kako bi se postigla kohezija sa primarnom bojom.

Tipografija je zasnovana na Space Grotesk fontu koji je odabran zbog svoje tehničke čitljivosti i modernog karaktera. Hijerarhija teksta jasno razlikuje naslove, podnaslove i telo teksta.

Dizajn je u potpunosti responzivan i prilagođen svim veličinama ekrana. Korisničko iskustvo temelji se na principima jednostavnosti i preglednosti. Svaka stranica ima jasno definisanu namenu bez nepotrebnih vizuelnih elemenata koji bi odvlačili pažnju od sadržaja.

---

## 7. Metodologija

Prilikom izrade projekta koristiće se agilna metodologija razvoja softvera zasnovana na iterativnom pristupu. Sistem se razvija po principu funkcionalnog jezgra kome se iterativno dodaju novi moduli koji se pregledaju i testiraju odmah po realizaciji. Prioritet se postavlja na kontinualnoj komunikaciji među članovima tima međusobno, tako i sa dodeljenim demonstratorom. Napredak se prati sistemom za kontrolu verzija.

---

## 8. Tehnologija

U ovom poglavlju su definisane tehnologije koje će se koristiti pri izradi projekta.

Za frontend će biti korišćeni HTML5, CSS3, kao i Next.js framework. Dinamičnost i responzivnost interfejsa postiže se upotrebom AJAX tehnologije. Za backend će biti korišćen Django na serverskoj strani. Što se tiče baze podataka, koristiće se PostgreSQL.

### 8.1. Eksterne integracije i API servisi

Kako bi platforma funkcionisala kao kompletan ekosistem i pružila validne podatke korisnicima, biće implementirane sledeće integracije:

- **GitHub REST API** — Verifikacija tehničkih veština učesnika. Sistem povlači podatke o javnim repozitorijumima, jezicima koji se najčešće koriste i doprinosima. Ovi podaci se koriste za AI modul koji uparuje timove, čime se izbegava ručni unos neverifikovanih veština.
- **Google Maps API** — Integrisano lociranje mesta održavanja hackathona uz pomoć mapa.
- **Google Calendar / Apple Calendar API** — Čim takmičar bude primljen na događaj, svi ključni termini (početak rada, radionice, rok za predaju, prezentacije) automatski se upisuju u njegov lični kalendar sa uključenim podsetnicima.
- **AI Agent** (neutvrđeno koji tačno) — Implementacija pametnog asistenta za formiranje timova. API analizira tekstualne opise projekata i upoređuje ih sa profilima slobodnih učesnika kako bi predložio najkompatibilnije članove tima na osnovu komplementarnosti njihovih veština.

---

## 9. Dokumentacija

Biće potrebno detaljnije dokumentovati osnovne složene delove sistema kako bi bila olakšana buduća nadogradnja. Planirana dokumentacija uključuje:

- API dokumentaciju za sve interne endpointe
- Tehničku dokumentaciju eksternih integracija
- Uputstvo za korišćenje sistema za svaku vrstu korisnika posebno
- Administratorski priručnik za upravljanje sistemom

---

## 10. Plan i prioriteti

Razvoj sistema tikimiki podeljen je u tri ključne faze prema prioritetu funkcionalnosti.

### 10.1. Primarne funkcionalnosti (MVP — Minimum Viable Product)

Ove funkcionalnosti su osnova sistema i neophodne su za puštanje aplikacije u rad. Ove funkcionalnosti su apsolutni minimum. Samo ove funkcionalnosti neće učiniti tikimiki posebnim, ali su bitne kao početni sadržaj:

- **Autentifikacija i profili** — Registracija korisnika (članovi i organizacije) i osnovno uređivanje profila.
- **Upravljanje hakathonima** — Kreiranje događaja od strane verifikovanih organizacija i pregled istih od strane gostiju/članova.
- **Sistem prijava** — Mehanizam prijave takmičara i njihovo odobravanje/odbijanje od strane organizatora.
- **Komunikacija** — Implementacija direktnih poruka i osnovnih grupnih kanala.

### 10.2. Napredne funkcionalnosti

Nakon realizacije osnovnog jezgra sistema (MVP), razvoj platforme tikimiki nastavlja se kroz iterativno dodavanje naprednih funkcionalnosti. Plan implementacije je osmišljen tako da se prvo uspostavi poverenje i bezbednost, zatim automatizuje tok samog događaja, a na kraju uvedu inovativni AI alati i sistemi za zadržavanje korisnika.

**Faza 1: Stabilizacija i poverenje**

U ovoj fazi fokus je na stvaranju sigurnog okruženja za rad. Prvo se implementira verifikacija organizacije i nadzor platforme uz sistem za prijavu neprikladnog sadržaja, kako bi se osigurao kvalitet objavljenih događaja. Paralelno se uvodi objedinjena pretraga sa filterima, kako bi korisnici mogli efikasno da navigiraju kroz rastuću bazu podataka.

**Faza 2: Automatizacija toka hakathona**

Nakon što je platforma bezbedna, fokus se pomera na korisničko iskustvo tokom samog takmičenja. Implementiraju se serveri za komunikaciju koji se automatski generišu, kao i integrisani Kanban modul za upravljanje zadacima. U ovoj fazi se dodaje i kalendar integracija unutar sistema prijava, čime se eliminiše potreba za eksternim alatima za organizaciju vremena.

**Faza 3: Napredna evaluacija i AI**

Ova faza donosi ključnu konkurentsku prednost platforme. Uvodi se AI uparivanje timova na osnovu GitHub aktivnosti i napredno odobravanje takmičara sa tehničkim filterima. Takođe, omogućava se video prezentacija projekta i sponzorski sistem nagrada, čime se zaokružuje tehnički proces takmičenja i omogućava sudijama i sponzorima lakši uvid u radove.

**Faza 4: Zabava i održivost**

Finalna faza razvoja usmerena je na dugoročni angažman korisnika. Implementira se sistem bedževa i poena koji je direktno povezan sa podnošenjem rezultata. Na samom kraju, uvodi se početna strana sa društvenim feed-om, glasanje publike, kao i sistemi monetizacije i zabave kroz premium status i dnevne mini igre sa prodavnicom poklona.

---

## Verzije dokumenta

| Verzija | Datum | Opis | Autori |
| --- | --- | --- | --- |
| 1.0 | 05.04.2026. | Inicijalna verzija | Andrej Čolić, Stevan Gnjato |
| 1.1 | 06.04.2026. | Dopuna i ispravka projektnog zadatka | Andrej Čolić |
| 2.0 | 06.04.2026. | Značajna dopuna projektnog zadatka | Andrej Čolić, Nenad Skoković |
| 2.1 | 10.04.2026. | Ispravka sekundarne dizajn boje | Dimitrije Pešić |
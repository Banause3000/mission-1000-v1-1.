let all = [];

let filter = "all";
let dayFilter = "today";

const $ = (id) => document.getElementById(id);

function odd(value) {
    const n = Number(value);
    return Number.isFinite(n)
        ? n.toFixed(2).replace(".", ",")
        : "–";
}

function statusText(status) {

    switch (status) {

        case "upcoming":
            return "Bevorstehend";

        case "live-or-started":
            return "Läuft / gestartet";

        case "completed":
            return "Beendet";

        default:
            return status || "Unbekannt";
    }
}

function todayString() {

    const d = new Date();

    return d.toISOString().slice(0,10);
}

function tomorrowString() {

    const d = new Date();

    d.setDate(d.getDate()+1);

    return d.toISOString().slice(0,10);
}

function matchRelevant(match){

    if(!match.startIso) return true;

    const start=new Date(match.startIso);

    const fourHours=4*60*60*1000;

    return start.getTime() > Date.now()-fourHours;
}

function currentMatches(){

    return all.filter(match=>{

        if(!matchRelevant(match))
            return false;

        if(dayFilter==="today" && match.date!==todayString())
            return false;

        if(dayFilter==="tomorrow" && match.date!==tomorrowString())
            return false;

        if(filter==="ATP" && match.tour!=="ATP")
            return false;

        if(filter==="WTA" && match.tour!=="WTA")
            return false;

        if(filter==="priced"){

            return Number.isFinite(Number(match.odds1))
                && Number.isFinite(Number(match.odds2));
        }

        return true;

    });

}

function interestingMatches(){

    return currentMatches()

        .filter(match=>{

            return Number.isFinite(Number(match.odds1))
                && Number.isFinite(Number(match.odds2));

        })

        .sort((a,b)=>{

            const diffA=Math.abs(a.odds1-a.odds2);

            const diffB=Math.abs(b.odds1-b.odds2);

            return diffA-diffB;

        })

        .slice(0,3);

}

function renderHighlights(){

    const box=$("highlights");

    box.innerHTML="";

    const list=interestingMatches();

    if(list.length===0){

        box.innerHTML=`
        <div class="empty">
        Heute keine interessanten Matches gefunden.
        </div>
        `;

        return;
    }

    list.forEach(match=>{

        const card=document.createElement("div");

        card.className="highlight-card";

        card.innerHTML=`

        <div class="highlight-meta">

            <span>${match.tour} · ${match.event}</span>

            <span>${match.start}</span>

        </div>

        <div class="highlight-match">

            <div>

                <b>${match.player1}</b>

                <span>${odd(match.odds1)}</span>

            </div>

            <div>

                <b>${match.player2}</b>

                <span>${odd(match.odds2)}</span>

            </div>

        </div>

        `;

        card.onclick=()=>showDetails(match);

        box.appendChild(card);

    });

}function showDetails(match){

    $("title").textContent=
        `${match.player1} vs. ${match.player2}`;

    $("meta").textContent=
        `${match.tour} · ${match.event}`;

    $("p1").textContent=match.player1;
    $("p2").textContent=match.player2;

    $("o1").textContent=odd(match.odds1);
    $("o2").textContent=odd(match.odds2);

    $("book1").textContent=
        match.bookmaker1 || "—";

    $("book2").textContent=
        match.bookmaker2 || "—";

    $("event").textContent=
        match.event || "—";

    $("start").textContent=
        `${match.date || ""} ${match.start || ""}`;

    $("status").textContent=
        statusText(match.status);

    $("detailSource").textContent=
        match.source || "The Odds API";

}

function render(){

    const matches=currentMatches();

    $("count").textContent=
        matches.length;

    $("priced").textContent=
        matches.filter(m=>

            Number.isFinite(Number(m.odds1))
            &&
            Number.isFinite(Number(m.odds2))

        ).length;

    const box=$("matches");

    box.innerHTML="";

    if(matches.length===0){

        box.innerHTML=`
        <div class="empty">
        Keine passenden Matches gefunden.
        </div>
        `;

        return;
    }

    matches.forEach((match,index)=>{

        const card=document.createElement("article");

        card.className=
            "card"+(index===0?" selected":"");

        card.innerHTML=`

        <div class="top">

            <div>

                <span class="tour-label">

                    ${match.tour}

                </span>

                <span>

                    ${match.event}

                </span>

            </div>

            <span>

                ${match.start}

            </span>

        </div>

        <div class="player">

            <div>

                <strong>

                    ${match.player1}

                </strong>

                <small>

                    ${match.bookmaker1 || ""}

                </small>

            </div>

            <b>

                ${odd(match.odds1)}

            </b>

        </div>

        <div class="player">

            <div>

                <strong>

                    ${match.player2}

                </strong>

                <small>

                    ${match.bookmaker2 || ""}

                </small>

            </div>

            <b>

                ${odd(match.odds2)}

            </b>

        </div>

        <div class="card-footer">

            <span>

                ${statusText(match.status)}

            </span>

            <span>

                ${match.date}

            </span>

        </div>

        `;

        card.onclick=()=>{

            document

                .querySelectorAll(".card")

                .forEach(c=>

                    c.classList.remove("selected")

                );

            card.classList.add("selected");

            showDetails(match);

        };

        box.appendChild(card);

    });

    showDetails(matches[0]);

}async function load(){

    $("updated").textContent=
        "Lädt …";

    try{

        const response=
            await fetch(
                `./data/matches.json?v=${Date.now()}`,
                {
                    cache:"no-store"
                }
            );

        if(!response.ok){

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        const payload=
            await response.json();

        all=
            Array.isArray(payload.matches)
            ? payload.matches
            : [];

        const generated=
            payload.generatedAt
            ? new Date(payload.generatedAt)
            : null;

        $("source").textContent=
            all.length
            ? "Aktuelle ATP- und WTA-Matches mit verfügbaren Quoten."
            : "Aktuell wurden keine passenden Matches gefunden.";

        $("updated").textContent=
            generated
            ? generated.toLocaleString(
                "de-DE",
                {
                    day:"2-digit",
                    month:"2-digit",
                    hour:"2-digit",
                    minute:"2-digit"
                }
            )
            : "Noch kein Datenlauf";

        $("sysSource").textContent=
            payload.source || "–";

        $("tz").textContent=
            payload.timezone || "Europe/Berlin";

        $("quota").textContent=
            payload.quota?.remaining ?? "–";

        renderHighlights();
        render();

    }
    catch(error){

        all=[];

        $("matches").innerHTML=`

        <div class="empty">

            Daten konnten nicht geladen werden.

            <br><br>

            ${error.message}

        </div>

        `;

        $("updated").textContent=
            "Ladefehler";

        $("count").textContent=
            "0";

        $("priced").textContent=
            "0";

    }

}

document
    .querySelectorAll("nav button")
    .forEach(button=>{

        button.onclick=()=>{

            document
                .querySelectorAll("nav button")
                .forEach(item=>

                    item.classList.remove("active")

                );

            button.classList.add("active");

            filter=
                button.dataset.filter;

            render();

        };

    });

document
    .querySelectorAll(".day")
    .forEach(button=>{

        button.onclick=()=>{

            document
                .querySelectorAll(".day")
                .forEach(item=>

                    item.classList.remove("active")

                );

            button.classList.add("active");

            dayFilter=
                button.dataset.day;

            render();

        };

    });

$("refresh").onclick=
    load;

$("date").textContent=
    new Date().toLocaleDateString(
        "de-DE",
        {
            weekday:"long",
            day:"2-digit",
            month:"2-digit",
            year:"numeric"
        }
    );

load();

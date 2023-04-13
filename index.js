// Import dépendances
const tsdav = require('tsdav');
const ical = require('node-ical');
const express = require('express');
const path = require('path');

// Création instance express
const app = express();

// Charger configurarion
require('dotenv').config();

let event_list = {last_update: '', events: []};

async function update_events() {
    // Connexion au serveur
    // Documentation: https://tsdav.vercel.app/docs/intro
    const client = await tsdav.createDAVClient({
        serverUrl: process.env.SERVER,
        credentials: {
            username: process.env.USERNAME,
            password: process.env.PASSWORD,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
    });

    let temp_event_list = [];

    const calendars = await client.fetchCalendars();

    // Plage des prochaines dates affichées. (J-1 à J+10)
    today = new Date(Date.now() - 86400000).toISOString()
    dans5jours = new Date(Date.now() + 864000000).toISOString()

    // Je fais passer le process par une fonction pour qu'il puisse prendre en compte le nom du calendrier.
    // Le nom du calendrier n'est pas pris en compte correctement sahs ça.
    async function fetchEvents(client, cal, type) {
        const objects = await client.fetchCalendarObjects({
            calendar: cal,
            timeRange: {
                start: today.slice(0,-14),
                end: dans5jours.slice(0,-14),
            },
            expand: true
        });

        for (events of objects) {
            ical.async.parseICS(events.data, function(err, data) {
                try {
                    obj = Object.entries(data)[0][1];
                } catch (e) {
                    return;
                }

                // Anonymisation des évènements
                switch (type) {
                    case 'Perso':
                        obj.summary = "🏠 Évènement personnel";
                        break;
                    case 'Pro':
                        obj.summary = "🏢 Travail";
                        break;
                    case 'ESTIAM':
                        obj.summary = "🎓 École";
                        break;
                }

                if(obj.recurrences) {
                    // Si l'évènement est récurrent, on le transforme en évènement unique pour chaque date.
                    for (recurrence of Object.entries(obj.recurrences)) {
                        recurrence = recurrence[1]
                        
                        temp_event_list.push({
                            type: type.toLowerCase(),
                            title: obj.summary,
                            start: new Date(recurrence.start).toISOString(),
                            end: new Date(recurrence.end).toISOString()
                        });
                    }
                } else {
                    // Stocke l'évènment en objet dans le cache.
                    temp_event_list.push({
                        type: type.toLowerCase(),
                        title: obj.summary,
                        start: new Date(obj.start).toISOString(),
                        end: new Date(obj.end).toISOString()
                    });
                }
            });
        }
    }


    for (cal of calendars) {
        await fetchEvents(client, cal, cal.displayName);
    }

    // Mise à jour du cache
    event_list = {last_update: (new Date(Date.now()).toISOString()), events: temp_event_list};
    console.log(new Date(Date.now()).toLocaleString('fr-FR', { hour12: false })+ " ==> Mise à jour du calendrier effectuée");

    // Actualisation du cache après expiration de 15 minutes.
    setTimeout(update_events, 900000);
}

// Mise à jour des évènements au lancement du serveur
update_events();

/* 

    WAYKY WAYKY ! IT'S TIME TO FROOOONT !

*/

app.get('/', function (req, res) {

    head = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="public/assets/favicon.ico"><title>Calendrier de Manoah</title><link rel="stylesheet" href="public/assets/style.css"></head>';
    content = '<div class="container"><p>🏠 Calendrier libre, de source ouverte, respecteux de la vie privée et fait maison permettant de connaître mes disponibilités sur les 10 prochains jours.<br>📝 Le contenu du calendrier se met à jour toutes les 15 minutes !<br>⚠️ Attention ! Le calendrier est à usage strictement informel, l\'exactitude du contenu affiché ne peut être garantie.</p></div>'
    dates = ""

    t = Date.now() - 86400000;
    i = 0;
    while (i != 12) {
        var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        var today = new Date(t);
        i++;
        t+=86400000;
        e = event_list.events.filter(
            event => new Date(event.start).toLocaleDateString("fr-FR", options) == today.toLocaleDateString("fr-FR", options)
        ).sort(
            (a, b) => new Date(a.start) - new Date(b.start)
        ).map(
            event => {
                txt = '<div class= "'+event.type+'"><b>'+new Date(event.start).toLocaleTimeString('fr-FR', { hour12: false }).slice(0,-3)+" - "+new Date(event.end).toLocaleTimeString('fr-FR', { hour12: false }).slice(0,-3)+"</b><br>"+event.title+"</div>";
                return txt;
            }
        )
        if (e == "") {
            e = '<div class="nothing"> ✅ Rien de prévu !</div>'
        }
        dates += ("<h1>" + today.toLocaleDateString("fr-FR", options) + "</h1><hr/>" + '<div class="date-container">' + e + '</div>');
    }

    footer = "<footer> <a href='https://github.com/LeMocha/michels-calendar'>Github</a> <a href='public/legal.html'>Mentions Légales</a> </footer>"

    // Le replaceAll c'est pour dégager des virgules qui apparaissent de manière indésirée sur des jours avec plusieurs évènements. 
    res.send(head + content + dates.replaceAll(",","")+ footer + '</html>');
})

// Routage des fichiers statiques
app.use('/public', express.static(path.join(__dirname, 'public')))

// Port d'écoute
app.listen(3000)
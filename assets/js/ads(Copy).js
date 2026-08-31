(function () {

    /* =========================================================
       1. HOSTINGER BANNER AD
       ========================================================= */

    const reactionsBlock = document.querySelector(".rc-reactions-block");

    if (reactionsBlock && !document.querySelector(".hostinger-banner-ad")) {

        const banner = document.createElement("div");

        banner.className = "hostinger-banner-ad";

        banner.style.cssText = `
            display:block !important;
            position:relative !important;
            width:100% !important;
            max-width:1000px !important;
            padding-top:25% !important;
            margin:20px auto !important;
            overflow:hidden !important;
            box-sizing:border-box !important;
            z-index:1 !important;
        `;

        banner.innerHTML = `
            <a href="https://www.hostinger.com/bd?REFERRALCODE=asuracomix"
               target="_blank"
               rel="nofollow sponsored noopener"
               style="
                   display:block !important;
                   position:absolute !important;
                   top:0 !important;
                   left:0 !important;
                   width:100% !important;
                   height:100% !important;
               ">
                <img
                    src="https://animeinpost.site/assets/misc/banner.png"
                    alt="Advertisement"
                    style="
                        display:block !important;
                        position:absolute !important;
                        top:0 !important;
                        left:0 !important;
                        width:100% !important;
                        height:100% !important;
                        object-fit:cover !important;
                    "
                >
            </a>
        `;

        reactionsBlock.insertAdjacentElement("afterend", banner);

        console.log("ADS: Hostinger banner inserted");
    }


    /* =========================================================
       2. EFFECTIVE CPM END-OF-PAGE AD
       ========================================================= */

    const endAdId =
        "container-465da2d3b057511071e4e0bafedb1b93";

    if (!document.getElementById(endAdId)) {

        const wrapper = document.createElement("div");

        wrapper.className = "effective-cpm-end-ad";

        wrapper.style.cssText = `
            display:block !important;
            width:100% !important;
            max-width:1000px !important;
            min-height:50px !important;
            margin:30px auto !important;
            text-align:center !important;
            overflow:hidden !important;
        `;

        const container = document.createElement("div");

        container.id = endAdId;

        wrapper.appendChild(container);

        const endAdScript = document.createElement("script");

        endAdScript.async = true;
        endAdScript.setAttribute("data-cfasync", "false");

        endAdScript.src =
            "https://pl30136701.effectivecpmnetwork.com/465da2d3b057511071e4e0bafedb1b93/invoke.js";

        endAdScript.onload = function () {
            console.log("ADS: End ad loaded");
        };

        endAdScript.onerror = function () {
            console.error("ADS: End ad failed to load");
        };

        wrapper.appendChild(endAdScript);

        document.body.appendChild(wrapper);
    }


    /* =========================================================
       3. PROFITABLE RATE CPM AD
       ========================================================= */

    if (!document.querySelector(".profitablerate-cpm-ad")) {

        const wrapper = document.createElement("div");

        wrapper.className = "profitablerate-cpm-ad";

        wrapper.style.cssText = `
            display:block !important;
            width:100% !important;
            max-width:1000px !important;
            min-height:50px !important;
            margin:30px auto !important;
            text-align:center !important;
            overflow:hidden !important;
        `;

        const adScript = document.createElement("script");

        adScript.src =
            "https://pl29616817.profitableratecpmnetwork.com/52/9a/d3/529ad3362ababfcdd4ddfe9153226333.js";

        adScript.async = true;

        adScript.onload = function () {
            console.log("ADS: Profitablerate CPM ad loaded");
        };

        adScript.onerror = function () {
            console.error("ADS: Profitablerate CPM ad failed to load");
        };

        wrapper.appendChild(adScript);

        document.body.appendChild(wrapper);
    }


    /* =========================================================
       4. PROFITABLE RATE CPM POPUNDER
       ========================================================= */

    if (!document.querySelector('script[data-popunder-ad="profitablerate"]')) {

        const popunderScript = document.createElement("script");

        popunderScript.src =
            "https://pl29612926.profitableratecpmnetwork.com/9c/90/ef/9c90ef745b2bdcfc9d06b26cf5f195f4.js";

        popunderScript.async = true;
        popunderScript.setAttribute("data-cfasync", "false");
        popunderScript.setAttribute("data-popunder-ad", "profitablerate");

        document.body.appendChild(popunderScript);

        console.log("ADS: Profitablerate popunder script loaded");
    }

})();
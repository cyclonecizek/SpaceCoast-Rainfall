# Updating GeneralForecasts

This update brings the latest planning-forecast engine to your personal forecast page and adds multi-model
wave guidance. Your settings, edits and place stay as they are (they live in your browser).

## Upload
1. Open github.com/cyclonecizek/GeneralForecasts → **docs** → **Add file → Upload files**.
2. Drag in `docs/index.html`, `docs/guidance.js` and `docs/planning-app.js` from this folder; they replace the
   old ones. Commit.
3. Back at the top of the repository, upload `README.md` the same way (optional).
4. Wait a minute for GitHub Pages, then reload the page (Ctrl+F5 if it looks unchanged).

## Check it with real data
1. Set a point on the water (for example Port Canaveral, or pick one just offshore on the map) and tick
   **Waves and sea state**.
2. Open **Guidance sources**. Under **Wave models** each model should say which model it loaded
   (ncep_gfswave016, ecmwf_wam, meteofrance_wave, gwam) and the NBM line should name its station. A model
   that says "not available" is skipped; the rest still blend.
3. The **NWS marine forecast** panel should show your zone (AMZ552 off the Cape, for example).
4. On the graph, **Seas** shows the blend with the spread between the models shaded.

If the NBM line says "no wave height for 41113", the NBM text at that buoy has no wave height through the
Iowa mirror; type another nearby buoy in **NBM marine station** (41009 is the Canaveral buoy) or leave it.

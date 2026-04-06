// comics_list.js defines: const COMICS = ["comics/file1.jpg", ...]
// This script picks a random comic and displays it.

(function () {
  const img = document.getElementById("comic-img");
  const noComics = document.getElementById("no-comics");
  const dateLabel = document.getElementById("date-label");
  const btnPrev = document.getElementById("btn-prev");
  const btnRandom = document.getElementById("btn-random");
  const btnNext = document.getElementById("btn-next");

  if (typeof COMICS === "undefined" || COMICS.length === 0) {
    img.style.display = "none";
    noComics.style.display = "block";
    btnPrev.disabled = true;
    btnRandom.disabled = true;
    btnNext.disabled = true;
    return;
  }

  // Sort comics so navigation order is consistent (alphabetical/chronological by filename)
  const sorted = COMICS.slice().sort();

  let currentIndex = Math.floor(Math.random() * sorted.length);

  function showComic(index) {
    currentIndex = index;
    const path = sorted[currentIndex];
    img.src = path;
    img.style.display = "block";
    noComics.style.display = "none";

    // Try to extract a date from the filename (common formats: YYYY-MM-DD, YYYYMMDD)
    const name = path.replace(/^comics\//, "").replace(/\.[^.]+$/, "");
    const dateMatch = name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      dateLabel.textContent = date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else {
      dateLabel.textContent = name;
    }
  }

  btnPrev.addEventListener("click", function () {
    showComic((currentIndex - 1 + sorted.length) % sorted.length);
  });

  btnNext.addEventListener("click", function () {
    showComic((currentIndex + 1) % sorted.length);
  });

  btnRandom.addEventListener("click", function () {
    showComic(Math.floor(Math.random() * sorted.length));
  });

  // Keyboard navigation
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") btnPrev.click();
    else if (e.key === "ArrowRight") btnNext.click();
    else if (e.key === "r" || e.key === "R") btnRandom.click();
  });

  showComic(currentIndex);
})();

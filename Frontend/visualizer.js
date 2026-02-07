async function loadBlocks() {
  const res = await fetch("http://127.0.0.1:5001/api/blocks");
  const blocks = await res.json();

  const chain = document.getElementById("chain");
  chain.innerHTML = "";

  blocks.forEach(b => {
    const div = document.createElement("div");
    div.className = "block";

    div.innerHTML = `
      <h3>Block #${b.blockNumber}</h3>
      <p><b>Event:</b> ${b.event}</p>
      <pre>${JSON.stringify(b.details, null, 2)}</pre>
    `;

    chain.appendChild(div);
  });
}

loadBlocks();

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlossaryProvider, RichText } from "../components/CodeBlock";

describe("RichText", () => {
  it("convierte `código` y **negrita**", () => {
    const { container } = render(
      <p>
        <RichText text="Usa **SELECT** para leer y `FROM productos` para elegir la tabla." />
      </p>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("SELECT");
    expect(container.querySelector("code")?.textContent).toBe("FROM productos");
  });

  it("separa los párrafos sin poner <p> dentro de <p>", () => {
    const { container } = render(
      <p>
        <RichText text={"Primer párrafo.\n\nSegundo con **negrita**."} />
      </p>,
    );
    expect(container.querySelectorAll("p p")).toHaveLength(0);
    expect(container.querySelectorAll(".rt-p")).toHaveLength(2);
  });

  it("en modo bloque devuelve un <p> por párrafo", () => {
    const { container } = render(
      <div>
        <RichText text={"Uno.\n\nDos.\n\n\nTres."} block />
      </div>,
    );
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["Uno.", "Dos.", "Tres."]);
  });

  it("marca los términos del glosario también dentro de la negrita, una sola vez", () => {
    const { container } = render(
      <GlossaryProvider items={[{ term: "tabla", definition: "Conjunto de filas." }]}>
        <div>
          <RichText text={"Una **tabla** tiene filas.\n\nOtra tabla más."} block />
        </div>
      </GlossaryProvider>,
    );
    expect(container.querySelectorAll(".term")).toHaveLength(1);
    expect(container.querySelector("strong .term")).not.toBeNull();
  });
});

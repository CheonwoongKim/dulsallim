import { CATEGORIES } from "../domain/expenses.js";

/**
 * 분류 선택지를 CATEGORIES 하나에서 만들어 넣는다.
 *
 * 손으로 적어 두면 분류를 하나 더할 때 세 곳(CATEGORIES, 지출 폼, 고정비 폼)을 고쳐야 한다.
 * 한 곳을 빠뜨리면 그 화면에서만 조용히 안 보이고, 셋이 다 같은지 확인해 주는 것도 없다.
 *
 * data-categories 의 값은 처음에 골라 둘 분류다(없으면 첫 번째).
 */
export function fillCategoryOptions(root = document) {
  for (const select of root.querySelectorAll("select[data-categories]")) {
    const 처음값 = select.dataset.categories;
    select.replaceChildren(
      ...Object.entries(CATEGORIES).map(([value, { label }]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === 처음값;
        return option;
      }),
    );
  }
}

# -*- coding: utf-8 -*-
"""Cota automaticamente as paredes usando o tipo de cota escolhido."""

__title__ = "Cotar\nParedes"
__author__ = "underscience lab"
__doc__ = (
    "Cria uma cota de comprimento para cada parede reta.\n\n"
    "Usa as paredes selecionadas; se nada estiver selecionado, usa todas as "
    "paredes do view ativo. Pede o tipo de cota (familia) a aplicar. "
    "Paredes curvas e paredes cujas faces de topo nao foram encontradas sao "
    "ignoradas e reportadas para cotagem manual."
)

from pyrevit import revit, DB, forms, script

doc = revit.doc
view = doc.ActiveView
output = script.get_output()

# offset da linha de cota em relacao a parede (em mm -> pes internos)
OFFSET_MM = 600.0
OFFSET = OFFSET_MM / 304.8

# views onde faz sentido cotar paredes por comprimento
VALID_VIEW_TYPES = (
    DB.ViewType.FloorPlan,
    DB.ViewType.CeilingPlan,
    DB.ViewType.EngineeringPlan,
    DB.ViewType.AreaPlan,
    DB.ViewType.Section,
    DB.ViewType.Elevation,
    DB.ViewType.Detail,
)


def get_walls():
    """Paredes selecionadas ou, se nada selecionado, todas as do view."""
    selection = revit.get_selection()
    walls = [e for e in selection if isinstance(e, DB.Wall)]
    if walls:
        return walls, True
    walls = (
        DB.FilteredElementCollector(doc, view.Id)
        .OfCategory(DB.BuiltInCategory.OST_Walls)
        .WhereElementIsNotElementType()
        .ToElements()
    )
    return list(walls), False


def get_linear_dim_types():
    """Tipos de cota lineares disponiveis no projeto."""
    types = (
        DB.FilteredElementCollector(doc)
        .OfClass(DB.DimensionType)
        .ToElements()
    )
    linear = []
    for dt in types:
        try:
            if dt.StyleType == DB.DimensionStyleType.Linear and dt.Name:
                linear.append(dt)
        except Exception:
            continue
    return sorted(linear, key=lambda x: x.Name)


def end_face_refs(wall, direction):
    """Referencias das duas faces de topo (extremos) da parede.

    Faces de topo tem normal paralela a direcao da parede. Retorna as duas
    faces mais distantes ao longo dessa direcao (os extremos reais).
    """
    opt = DB.Options()
    opt.ComputeReferences = True
    opt.IncludeNonVisibleObjects = False
    opt.View = view

    faces_info = []  # (projecao ao longo da direcao, reference)
    geo = wall.get_Geometry(opt)
    if geo is None:
        return None
    for obj in geo:
        if not isinstance(obj, DB.Solid) or obj.Faces.Size == 0:
            continue
        for face in obj.Faces:
            if not isinstance(face, DB.PlanarFace):
                continue
            ref = face.Reference
            if ref is None:
                continue
            normal = face.FaceNormal.Normalize()
            if abs(normal.DotProduct(direction)) > 0.99:
                proj = face.Origin.DotProduct(direction)
                faces_info.append((proj, ref))

    if len(faces_info) < 2:
        return None
    faces_info.sort(key=lambda t: t[0])
    return faces_info[0][1], faces_info[-1][1]


def run():
    if view.ViewType not in VALID_VIEW_TYPES:
        forms.alert(
            "O view ativo ({}) nao suporta cotagem de paredes.\n"
            "Abra uma planta, corte ou elevacao e rode de novo.".format(
                view.ViewType
            ),
            exitscript=True,
        )

    walls, from_selection = get_walls()
    if not walls:
        forms.alert("Nenhuma parede encontrada no view ativo.", exitscript=True)

    dim_types = get_linear_dim_types()
    if not dim_types:
        forms.alert(
            "Nenhum tipo de cota linear encontrado no projeto.", exitscript=True
        )

    chosen = forms.SelectFromList.show(
        dim_types,
        name_attr="Name",
        title="Escolha o tipo de cota",
        button_name="Cotar paredes",
        multiselect=False,
    )
    if not chosen:
        script.exit()

    created = 0
    skipped_curved = 0
    skipped_faces = 0
    errors = 0

    with revit.Transaction("Cotar paredes automaticamente"):
        for wall in walls:
            loc = wall.Location
            if not isinstance(loc, DB.LocationCurve):
                skipped_faces += 1
                continue
            curve = loc.Curve
            if not isinstance(curve, DB.Line):
                skipped_curved += 1
                continue

            direction = curve.Direction.Normalize()
            try:
                refs = end_face_refs(wall, direction)
                if refs is None:
                    skipped_faces += 1
                    continue

                ref_array = DB.ReferenceArray()
                ref_array.Append(refs[0])
                ref_array.Append(refs[1])

                # linha de cota paralela a parede, deslocada no plano do view
                perp = view.ViewDirection.CrossProduct(direction).Normalize()
                offset_vec = perp.Multiply(OFFSET)
                p0 = curve.GetEndPoint(0).Add(offset_vec)
                p1 = curve.GetEndPoint(1).Add(offset_vec)
                dim_line = DB.Line.CreateBound(p0, p1)

                dim = doc.Create.NewDimension(view, dim_line, ref_array)
                if dim is not None:
                    try:
                        dim.ChangeTypeId(chosen.Id)
                    except Exception:
                        pass  # mantem o tipo padrao se a troca falhar
                    created += 1
            except Exception as ex:
                errors += 1
                output.print_md("- Falha na parede `{}`: {}".format(wall.Id, ex))

    output.print_md("## Cotagem de paredes concluida")
    output.print_md("**Tipo de cota:** {}".format(chosen.Name))
    output.print_md(
        "**Fonte:** {}".format(
            "selecao atual" if from_selection else "todas as paredes do view"
        )
    )
    output.print_md("- Cotas criadas: **{}**".format(created))
    output.print_md("- Paredes curvas ignoradas: {}".format(skipped_curved))
    output.print_md(
        "- Paredes sem faces de topo detectadas (cotar manual): {}".format(
            skipped_faces
        )
    )
    if errors:
        output.print_md("- Erros: {}".format(errors))
    output.print_md(
        "\n> Reveja o resultado no Revit. Paredes unidas/mitradas e "
        "geometria complexa podem precisar de cotagem manual."
    )


run()

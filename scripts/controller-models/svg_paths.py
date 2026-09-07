"""Sample the explicit SVG path commands used by the supplied brand outlines.

This deliberately rejects unsupported commands instead of approximating their
meaning. Translation in a parent group does not change a centered normalized
outline, so the selected path is normalized from its own sampled bounds.
"""
import re
import xml.etree.ElementTree as ET


def path_contours(data, steps=16):
    tokens = re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?', data)
    result = []
    points = []
    current = (0.0, 0.0)
    start = current
    previous_control = None
    command = None
    index = 0

    def pair(relative):
        nonlocal index
        x, y = float(tokens[index]), float(tokens[index + 1])
        index += 2
        return (x + current[0], y + current[1]) if relative else (x, y)

    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
        relative = command.islower()
        operation = command.upper()
        if operation == 'Z':
            if points:
                if len(points) > 1 and abs(points[-1][0]-points[0][0])+abs(points[-1][1]-points[0][1]) < 1e-7:
                    points.pop()
                result.append(points)
            points = []
            current = start
            previous_control = None
            command = None
        elif operation == 'M':
            if points:
                result.append(points)
            current = pair(relative)
            start = current
            points = [current]
            command = 'l' if relative else 'L'
            previous_control = None
        elif operation == 'L':
            current = pair(relative)
            points.append(current)
            previous_control = None
        elif operation == 'H':
            x = float(tokens[index])
            index += 1
            current = (current[0]+x if relative else x, current[1])
            points.append(current)
            previous_control = None
        elif operation == 'V':
            y = float(tokens[index])
            index += 1
            current = (current[0], current[1]+y if relative else y)
            points.append(current)
            previous_control = None
        elif operation in ('C', 'S'):
            c1 = pair(relative) if operation == 'C' else (
                (2*current[0]-previous_control[0], 2*current[1]-previous_control[1])
                if previous_control else current
            )
            c2 = pair(relative)
            end = pair(relative)
            for sample in range(1, steps + 1):
                t = sample / steps
                u = 1 - t
                points.append(tuple(u**3*current[k]+3*u*u*t*c1[k]+3*u*t*t*c2[k]+t**3*end[k] for k in range(2)))
            current = end
            previous_control = c2
        else:
            raise ValueError(f'Unsupported SVG path command: {command}')
    if points:
        result.append(points)
    return result


def normalized_svg_contours(path, keep_subpaths=None, path_index=0):
    root = ET.parse(path).getroot()
    paths = root.findall('.//{http://www.w3.org/2000/svg}path')
    contours = path_contours(paths[path_index].attrib['d'])
    if keep_subpaths is not None:
        contours = contours[:keep_subpaths]
    xs = [x for contour in contours for x, _ in contour]
    ys = [y for contour in contours for _, y in contour]
    center_x = (min(xs) + max(xs)) / 2
    center_y = (min(ys) + max(ys)) / 2
    width = max(xs) - min(xs)
    return [[((x-center_x)/width, (center_y-y)/width) for x, y in contour] for contour in contours]

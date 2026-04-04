using UnityEngine;

public class FakeShadowFollow : MonoBehaviour
{
    public Transform car;
    public float shadowHeight = 0.02f;
    public float scaleMultiplier = 0.5f;

    Vector3 baseScale;


    void LateUpdate()
    {
        if (car == null) return;

        Vector3 pos = car.position;
        pos.y = shadowHeight;
        transform.position = pos;

        transform.rotation = Quaternion.Euler(0f, car.eulerAngles.y, 0f);

        float height = car.position.y;
        float scale = 1 + height * scaleMultiplier;

    }
}
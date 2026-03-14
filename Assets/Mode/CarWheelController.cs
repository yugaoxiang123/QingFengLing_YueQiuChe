using UnityEngine;
using System.Collections.Generic;
using System.Collections;

[System.Serializable]
public class WheelInfo
{
    public WheelCollider collider;
    public Transform visualMesh;
    public bool motor;
    public bool steering;
}

public class CarWheelController : MonoBehaviour
{
    [Header("移动设置")]
    public List<WheelInfo> wheelInfos;
    public float maxMotorTorque = 500f;
    public float maxSteeringAngle = 30f;

    [Header("动画与货物")]
    public Animator animator;
    public GameObject cargoObject;

    private bool isInLoadingZone = false;
    private bool isInUnloadingZone = false;
    private bool isHaveGoods = false;
    private bool CanController = true; // 控制是否可以移动和操作

    private int ClickCount = 0;

    // 引用刚体
    private Rigidbody rb;
    void Start()
    {
        rb = GetComponent<Rigidbody>();
        if (cargoObject != null) cargoObject.SetActive(false);

    }

    void Update()
    {
        // 如果正在播放装卸动画，禁止后续 Q/E 逻辑执行
        if (!CanController) return;
        // 获取输入
        float motorInput = Input.GetAxis("Vertical");
        float steerInput = Input.GetAxis("Horizontal");

        // --- 修复 1: 移动检测逻辑 ---
        // 只要有明显的位移输入，就应该尝试恢复 Idle 状态
        if (Mathf.Abs(motorInput) > 0.1f || Mathf.Abs(steerInput) > 0.1f)
        {
            animator.SetBool("Reset", true);
            ClickCount = 0; // 移动时重置点击计数
        }

        // --- 修复 2: 将物理更新放在 CanController 判断之后，或者限制动力 ---
        float motor = (CanController) ? maxMotorTorque * motorInput : 0;
        float steering = maxSteeringAngle * steerInput;

        foreach (WheelInfo wheel in wheelInfos)
        {
            if (wheel.collider == null || wheel.visualMesh == null) continue;
            if (wheel.steering) wheel.collider.steerAngle = steering;
            if (wheel.motor) wheel.collider.motorTorque = motor;
            ApplyLocalPositionToVisuals(wheel.collider, wheel.visualMesh);
        }



        // --- 逻辑控制：装货 ---
        if (Input.GetKeyDown(KeyCode.Q) && isInLoadingZone && !isHaveGoods)
        {
            HandleAction("Load", true);
        }

        // --- 逻辑控制：卸货 ---
        if (Input.GetKeyDown(KeyCode.E) && isInUnloadingZone && isHaveGoods)
        {
            HandleAction("Unload", false);
        }

        // 处理点击计数（防止在区域内反复按键导致的逻辑卡死）
        if (isInLoadingZone || isInUnloadingZone)
        {
            if (Input.GetKeyDown(KeyCode.Q) || Input.GetKeyDown(KeyCode.E))
            {
                ClickCount++;
            }
            if (ClickCount > 1)
            {
                animator.SetBool("Reset", true);
            }
        }
    }

    private void HandleAction(string triggerName, bool nextGoodsState)
    {
        // 1. 瞬间切断动力并刹车
        StopCarImmediately();

        // 2. 动画与逻辑控制
        animator.SetBool("Reset", false);
        animator.ResetTrigger("Load");
        animator.ResetTrigger("Unload");
        animator.SetTrigger(triggerName);

        isHaveGoods = nextGoodsState;
        StopAllCoroutines();
        StartCoroutine(WaitAndSetCargo(isHaveGoods));
    }

    // 瞬间刹车函数
    private void StopCarImmediately()
    {
        if (rb != null)
        {
            // 如果 linearVelocity 报错，就直接用 velocity
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;

            // 进阶：如果小车还在抖动，可以强制设置刚体进入睡眠
            rb.Sleep();
        }

        foreach (WheelInfo wheel in wheelInfos)
        {
            if (wheel.collider != null)
            {
                wheel.collider.motorTorque = 0;
                // 刹车力设大一点，防止在坡道上下滑
                wheel.collider.brakeTorque = 20000f;
            }
        }
        Debug.Log("小车已完全静止并锁定刹车");
    }

    // 在小车恢复移动或动画结束时，记得释放刹车力
    private void ReleaseBrake()
    {
        foreach (WheelInfo wheel in wheelInfos)
        {
            if (wheel.collider != null)
            {
                wheel.collider.brakeTorque = 0;
            }
        }
    }

    private IEnumerator WaitAndSetCargo(bool shouldShow)
    {
        yield return new WaitForEndOfFrame();

        // 检查是否成功切换到非 Idle 状态
        if (animator.GetCurrentAnimatorStateInfo(0).IsName("Idle"))
        {
            Debug.LogWarning("动画未能成功切换，请检查连线条件");
            yield break;
        }

        CanController = false; // 锁定操作

        AnimatorStateInfo stateInfo = animator.GetCurrentAnimatorStateInfo(0);
        float animationLength = stateInfo.length;

        yield return new WaitForSeconds(animationLength);

        if (cargoObject != null)
        {
            cargoObject.SetActive(shouldShow);
        }

        ReleaseBrake();
        CanController = true; // 解锁操作
    }

    private void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("LoadingZone"))
        {
            animator.SetBool("Reset", false);
            isInLoadingZone = true;
        }
        else if (other.CompareTag("UnloadingZone"))
        {
            animator.SetBool("Reset", false);
            isInUnloadingZone = true;

        }
    }

    private void OnTriggerExit(Collider other)
    {
        if (other.CompareTag("LoadingZone") || other.CompareTag("UnloadingZone"))
        {
            isInLoadingZone = false;
            isInUnloadingZone = false;
            animator.SetBool("Reset", true);
            ClickCount = 0;

            // 离开区域时，如果动画还没播完，强制恢复货物显隐状态
            if (!CanController)
            {
                StopAllCoroutines();
                CanController = true;
                if (cargoObject != null) cargoObject.SetActive(isHaveGoods);
            }
        }
    }

    public void ApplyLocalPositionToVisuals(WheelCollider collider, Transform visualMesh)
    {
        Vector3 pos; Quaternion rot;
        collider.GetWorldPose(out pos, out rot);
        visualMesh.position = pos;
        visualMesh.rotation = rot;
    }
    public void PulseRelay()
    {
        Debug.Log("IO_RELAY:PULSE");
    }
}